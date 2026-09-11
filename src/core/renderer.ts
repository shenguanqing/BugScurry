import { squishPressure } from "./squish";
import { getSpecies } from "../species";
import type { Bug, Particle, Stain, Viewport } from "./types";

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness (no external RNG state, no per-frame flicker)
// ---------------------------------------------------------------------------

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return (h % 10000) / 10000;
}

/** Smooth, organic irregular blob (rounded polygon) instead of a perfect ellipse. */
function smoothBlobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  points = 9,
  jitter = 0.26,
): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const j = 1 + (hash(seed + i * 3.71) - 0.5) * jitter;
    pts.push({ x: cx + Math.cos(a) * rx * j, y: cy + Math.sin(a) * ry * j });
  }
  ctx.beginPath();
  const last = pts[pts.length - 1];
  ctx.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Bug squish transform
// ---------------------------------------------------------------------------

/** Pressure spreads the silhouette on the desktop plane, retaining its anatomy. */
function applySquishTransform(ctx: CanvasRenderingContext2D, bug: Bug): number {
  ctx.translate(bug.x, bug.y);
  ctx.rotate(bug.heading);
  if (bug.state !== "squishing" && bug.state !== "dying") return 1;

  const t = bug.state === "dying" ? 1 : bug.deathProgress;
  const pressure = squishPressure(bug);
  // A small, damped release; no elastic bounce or change at the state boundary.
  const release = Math.max(0, (t - 0.42) / 0.58);
  const spread = pressure * (1 - 0.12 * release);
  ctx.translate(bug.size * (bug.seed - 0.5) * 0.09 * spread, 0);
  ctx.transform(1, 0, (bug.seed - 0.5) * 0.22 * spread, 1, 0, 0);
  ctx.rotate((bug.seed - 0.5) * 0.18 * spread);
  ctx.scale(1 + 0.2 * spread, 1 - 0.23 * spread);

  if (bug.state !== "dying") return 1;
  const fade = Math.max(0, (bug.deathProgress - 0.28) / 0.72);
  return 1 - fade * fade * (3 - 2 * fade);
}

export function drawBug(ctx: CanvasRenderingContext2D, bug: Bug): void {
  ctx.save();
  const alpha = applySquishTransform(ctx, bug);
  const species = getSpecies(bug.species);
  // Keep the original species silhouette and frozen gait throughout death.
  // Replacing it with a generic blob loses wings, shell and leg anatomy.
  if (species) species.draw(ctx, bug, alpha);

  if (species && (bug.state === "squishing" || bug.state === "dying")) {
    const pressure = squishPressure(bug);
    const s = bug.size;
    // Fine displaced shell seams give the compressed body an uneven surface.
    ctx.globalAlpha = alpha * pressure * 0.65;
    ctx.strokeStyle = species.traits.stainColor ?? "#3b2a1a";
    ctx.lineWidth = Math.max(0.45, s * 0.018);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, -s * 0.12);
    ctx.lineTo(-s * 0.17, -s * 0.025);
    ctx.lineTo(-s * 0.09, s * 0.07);
    ctx.lineTo(s * 0.04, s * 0.13);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStain(ctx: CanvasRenderingContext2D, stain: Stain): void {
  const t = 1 - stain.life / stain.maxLife;
  const alpha = Math.max(0, 0.28 * (1 - t * t));
  const species = getSpecies(stain.species);
  const color = species?.traits.stainColor ?? "#3b2a1a";
  const seed = hashStr(stain.id) * 1000;

  ctx.save();
  ctx.translate(stain.x, stain.y);
  ctx.rotate(stain.heading);
  const spread = 1 - Math.pow(1 - Math.min(1, t * stain.maxLife / 0.1), 3);
  ctx.scale(0.65 + spread * 0.35, 0.65 + spread * 0.35);

  // Main irregular puddle
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  smoothBlobPath(ctx, 0, 0, stain.size * 0.85, stain.size * 0.46, seed, 10, 0.34);
  ctx.fill();

  // Small connected lobes squeeze out sideways from beneath the shell.
  // Stable seeds retain their outline as the fluid spreads and settles.
  const fluid = species?.traits.fluidColor ?? "#b3a45b";
  const highlight = species?.traits.fluidHighlight ?? "#fff3cf";
  const shadow = species?.traits.fluidShadow ?? "#82743c";
  const wetAlpha = Math.max(0, (1 - t * t) * spread);
  const s = stain.size;
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = (hash(seed + i * 4.7) - 0.55) * s * 0.95;
    const y = side * s * (0.24 + spread * (0.15 + hash(seed + i * 2.3) * 0.14));
    const rx = s * (0.16 + hash(seed + i * 7.1) * 0.12);
    const ry = s * (0.11 + hash(seed + i * 3.9) * 0.09);
    const gradient = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.3, 0, x, y, rx * 1.15);
    gradient.addColorStop(0, highlight);
    gradient.addColorStop(0.6, fluid);
    gradient.addColorStop(1, shadow);
    // A short wet neck connects the expelled bead to the compressed abdomen.
    ctx.globalAlpha = wetAlpha * 0.38;
    ctx.strokeStyle = fluid;
    ctx.lineWidth = ry * 0.85;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x * 0.8, side * s * 0.17);
    ctx.quadraticCurveTo(x - s * 0.06, y * 0.75, x, y);
    ctx.stroke();
    ctx.globalAlpha = wetAlpha * 0.62;
    ctx.fillStyle = gradient;
    smoothBlobPath(ctx, x, y, rx, ry, seed + i * 8.3, 8, 0.4);
    ctx.fill();
    // Narrow meniscus and an offset highlight suggest a shallow liquid bead.
    ctx.globalAlpha = wetAlpha * 0.25;
    ctx.strokeStyle = shadow;
    ctx.lineWidth = Math.max(0.35, s * 0.012);
    ctx.stroke();
    ctx.globalAlpha = wetAlpha * 0.62;
    ctx.strokeStyle = highlight;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.45, s * 0.02);
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.08, y - ry * 0.12, rx * 0.65, ry * 0.6, 0, Math.PI * 1.12, Math.PI * 1.65);
    ctx.stroke();
  }

  // A few tiny beads travel a short distance, then remain with the wet mark.
  for (let i = 0; i < 3; i++) {
    const a = hash(seed + i * 6.6) * Math.PI * 2;
    const dist = s * (0.7 + hash(seed + i * 2.2) * 0.4) * spread;
    const r = s * (0.035 + hash(seed + i * 9.4) * 0.035);
    const x = Math.cos(a) * dist;
    const y = Math.sin(a) * dist;
    ctx.globalAlpha = wetAlpha * 0.65;
    ctx.fillStyle = fluid;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = wetAlpha * 0.7;
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    const speed = Math.hypot(p.vx, p.vy);
    const angle = Math.atan2(p.vy, p.vx);
    // Stretch fast droplets along their direction of travel for a motion-blurred, liquid feel
    const stretch = Math.min(2.6, 1 + speed * 0.006);
    const r = Math.max(0.4, p.size * a);

    ctx.save();
    ctx.globalAlpha = a * 0.78;
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * stretch, r / Math.sqrt(stretch), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  bugs: Bug[],
  stains: Stain[],
  particles: Particle[],
  viewport: Viewport,
): void {
  ctx.save();
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  for (const stain of stains) drawStain(ctx, stain);
  for (const bug of bugs) drawBug(ctx, bug);
  drawParticles(ctx, particles);

  ctx.restore();
}
