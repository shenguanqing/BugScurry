import { drawAtmosphere } from "./atmosphere";
import { squishPressure } from "./squish";
import { RAIN_LAYERS, RAIN_PROFILES, lightningFlash, rainWindAt } from "./weather";
import type { RainKind } from "./types";
import { getSpecies } from "../species";
import { contactShadow } from "../species/drawing";
import type { Bait, Bug, FloatText, Particle, Stain, Viewport } from "./types";

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
  for (let i = 0; i < points; i++) {
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
  // Warm post-meal glow (favorite snacks linger longer).
  if (bug.satisfiedTimer > 0 && bug.state !== "dying" && bug.state !== "squishing") {
    const k = Math.min(1, bug.satisfiedTimer / 3.5);
    const r = bug.size * (1.2 + 0.1 * Math.sin(bug.legPhase * Math.PI * 2));
    ctx.save();
    ctx.translate(bug.x, bug.y);
    const glow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    glow.addColorStop(0, `rgba(255, 204, 140, ${0.18 * k})`);
    glow.addColorStop(0.55, `rgba(255, 190, 120, ${0.08 * k})`);
    glow.addColorStop(1, "rgba(255, 190, 120, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  const alpha = applySquishTransform(ctx, bug);
  const eatStyle = bug.eatingBaitId
    ? getSpecies(bug.species)?.traits.eatStyle
    : undefined;
  // Bee hover bob / caterpillar body ripple while munching.
  if (eatStyle === "hover") {
    ctx.translate(0, Math.sin(bug.legPhase * Math.PI * 4) * 1.6);
  } else if (eatStyle === "ripple") {
    const w = 1 + Math.sin(bug.legPhase * Math.PI * 6) * 0.07;
    ctx.scale(w, 2 - w);
  }

  // Fat bug: slightly chunkier read + hurt flash.
  if (bug.maxHp > 1) {
    ctx.scale(1.04, 1.08);
  }
  if (bug.hurtTimer > 0) {
    const k = bug.hurtTimer / 0.18;
    ctx.globalAlpha = alpha * (1 - 0.35 * k);
  }

  // Grounding shadow: keeps the silhouette readable on light and dark wallpapers.
  if (alpha > 0.05 && bug.state !== "dying") {
    const lift = eatStyle === "hover" ? 1.25 : 1;
    contactShadow(ctx, bug.size * 0.92 * lift, 0.18 * alpha);
  }

  const species = getSpecies(bug.species);
  if (species) species.draw(ctx, bug, alpha);

  if (bug.hurtTimer > 0 && species) {
    const k = bug.hurtTimer / 0.18;
    ctx.globalAlpha = alpha * 0.45 * k;
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "#ff6b4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, bug.size * 0.95, bug.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  if (species && (bug.state === "squishing" || bug.state === "dying")) {
    const pressure = squishPressure(bug);
    const s = bug.size;
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

  if (bug.enjoyingFood && bug.eatingBaitId && bug.state === "paused") {
    ctx.save();
    ctx.translate(bug.x, bug.y - bug.size - 8 - Math.sin(bug.legPhase * Math.PI * 2) * 2);
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-10, -2, -5, -9, 0, -4);
    ctx.bezierCurveTo(5, -9, 10, -2, 0, 3);
    ctx.fillStyle = "#f5789e";
    ctx.strokeStyle = "#fff5f8";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Ant haul: a crumb rides just ahead of the mandibles.
  if (bug.carryKind && bug.state !== "dying" && bug.state !== "squishing") {
    const s = bug.size * 0.28;
    const ahead = bug.size * 0.55;
    const x = bug.x + Math.cos(bug.heading) * ahead;
    const y = bug.y + Math.sin(bug.heading) * ahead;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bug.heading);
    if (bug.carryKind === "sugar") {
      ctx.fillStyle = "#fff8ed";
      ctx.strokeStyle = "#aaa6ba";
      ctx.lineWidth = 0.8;
      ctx.fillRect(-s * 0.55, -s * 0.45, s * 1.1, s * 0.9);
      ctx.strokeRect(-s * 0.55, -s * 0.45, s * 1.1, s * 0.9);
    } else if (bug.carryKind === "fruit") {
      ctx.fillStyle = "#f25f6b";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.7, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#c9a66b";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.65, s * 0.48, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawBait(ctx: CanvasRenderingContext2D, bait: Bait): void {
  const t = Math.max(0, bait.life / bait.maxLife);
  // Fade in quickly, linger, then dissolve.
  const alpha = Math.min(1, (1 - t) * 8 + 0.25) * Math.min(1, t * 4);
  const seed = hashStr(bait.id) * 1000;
  const s = bait.size;

  ctx.save();
  ctx.translate(bait.x, bait.y);
  ctx.rotate(hash(seed) * Math.PI);

  // Soft shadow
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(1.5, 2, s * 1.05, s * 0.7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  if (bait.kind === "sugar") {
    // A small faceted sugar cube, outlined for light desktops.
    ctx.fillStyle = "#fff8ed";
    ctx.strokeStyle = "#aaa6ba";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-s * 0.7, -s * 0.65, s * 1.4, s * 1.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8d3e2";
    ctx.beginPath();
    ctx.moveTo(s * 0.7, -s * 0.65);
    ctx.lineTo(s, -s * 0.9);
    ctx.lineTo(s, s * 0.4);
    ctx.lineTo(s * 0.7, s * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.65);
    ctx.lineTo(-s * 0.4, -s * 0.9);
    ctx.lineTo(s, -s * 0.9);
    ctx.lineTo(s * 0.7, -s * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (bait.kind === "fruit") {
    // Red berry with seeds and a green leaf; distinct from a brown crumb.
    ctx.fillStyle = "#f25f6b";
    ctx.strokeStyle = "#a63349";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(-s * 1.5, 0, -s, -s, 0, -s * 0.55);
    ctx.bezierCurveTo(s, -s, s * 1.5, 0, 0, s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff2bd";
    for (const [x, y] of [[-0.35, -0.15], [0.3, -0.15], [0, 0.4]]) {
      ctx.beginPath();
      ctx.ellipse(x * s, y * s, 0.8, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#67a84b";
    ctx.beginPath();
    ctx.ellipse(s * 0.2, -s * 0.65, s * 0.5, s * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Cookie crumb body
  ctx.fillStyle = "#c9a66b";
  smoothBlobPath(ctx, 0, 0, s, s * 0.78, seed, 8, 0.4);
  ctx.fill();
  ctx.strokeStyle = "#8a6234";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Chips
  ctx.fillStyle = "#4a2c1a";
  for (let i = 0; i < 3; i++) {
    const a = hash(seed + i * 3.1) * Math.PI * 2;
    const d = s * (0.25 + hash(seed + i * 1.7) * 0.35);
    const r = s * (0.14 + hash(seed + i * 5.3) * 0.08);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.75, r, r * 0.85, a, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawStain(ctx: CanvasRenderingContext2D, stain: Stain): void {
  const t = 1 - stain.life / stain.maxLife;
  const alpha = Math.max(0, 0.28 * (1 - t * t));
  const seed = hashStr(stain.id) * 1000;

  // Fruit juice: soft pink blot, not a kill stain.
  if (stain.species === "__juice") {
    ctx.save();
    ctx.translate(stain.x, stain.y);
    ctx.globalAlpha = Math.max(0, 0.32 * (1 - t * t));
    ctx.fillStyle = "#f06a7a";
    smoothBlobPath(ctx, 0, 0, stain.size * 0.7, stain.size * 0.42, seed, 9, 0.38);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, 0.18 * (1 - t));
    ctx.fillStyle = "#ffb0b8";
    ctx.beginPath();
    ctx.ellipse(-stain.size * 0.12, -stain.size * 0.08, stain.size * 0.22, stain.size * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const species = getSpecies(stain.species);
  const color = species?.traits.stainColor ?? "#3b2a1a";

  ctx.save();
  ctx.translate(stain.x, stain.y);
  ctx.rotate(stain.heading);
  const spread = 1 - Math.pow(1 - Math.min(1, t * stain.maxLife / 0.1), 3);
  ctx.scale(0.65 + spread * 0.35, 0.65 + spread * 0.35);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  smoothBlobPath(ctx, 0, 0, stain.size * 0.85, stain.size * 0.46, seed, 10, 0.34);
  ctx.fill();

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
    const stretch = Math.min(2.6, 1 + speed * 0.006);
    const r = p.size * (0.75 + a * 0.25);

    ctx.save();
    ctx.globalAlpha = Math.min(1, a / 0.65) * 0.9;
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * stretch, r / Math.sqrt(stretch), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#514b3a66";
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = "#fff9e6bb";
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.2, r * 0.32, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawFloats(ctx: CanvasRenderingContext2D, floats: FloatText[]): void {
  for (const f of floats) {
    const t = f.life / f.maxLife;
    const alpha = Math.min(1, t * 2.2);
    const scale = 1 + (1 - t) * 0.15;
    const size = (f.tier >= 3 ? 18 : f.tier >= 2 ? 15 : 13) * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${size}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = "rgba(20,16,12,0.75)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.tier >= 2 ? "#ffd666" : "#fff6e0";
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

/**
 * Depth-layered rain scaled by storm kind. Deterministic per index so rain
 * does not allocate or flicker between frames; alpha stays low enough to
 * keep the desktop readable even in a downpour.
 */
export function drawRain(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeSec: number,
  kind: RainKind = "moderate",
  windBase = 0.3,
): void {
  const profile = RAIN_PROFILES[kind];
  const h = viewport.height;
  const w = viewport.width;
  const wind = rainWindAt(windBase, profile, timeSec);

  ctx.save();
  ctx.lineCap = "round";
  ctx.fillStyle = "rgba(168, 190, 220, 0.55)";

  let index = 0;
  for (const layer of RAIN_LAYERS) {
    const count = Math.max(4, Math.round(layer.count * profile.density));
    const layerAlpha = Math.min(0.55, layer.alpha * profile.alphaMul);
    ctx.strokeStyle = `rgba(168, 190, 220, ${layerAlpha})`;
    ctx.lineWidth = layer.width;
    for (let i = 0; i < count; i++) {
      const seed = index * 17.13 + 3;
      index++;
      const speed = layer.speedMin + hash(seed) * (layer.speedMax - layer.speedMin);
      const x0 = hash(seed + 1.7) * w;
      const len =
        (layer.lenMin + hash(seed + 2.9) * (layer.lenMax - layer.lenMin)) * profile.lengthMul;
      // Per-drop lean around the shared wind so the field is not one rigid rake.
      const slant = wind + (hash(seed + 4.1) - 0.5) * 0.16;
      const span = h + len + 48;
      const fall = (hash(seed + 5.3) * span + timeSec * speed) % span;
      const y = fall - len - 24;
      const x = x0 + Math.sin(timeSec * 0.33 + seed) * (2 + profile.windGust * 30);
      const flicker = (0.7 + hash(seed + 6.5) * 0.5) * Math.min(1.15, profile.alphaMul);
      ctx.globalAlpha = Math.min(0.95, flicker);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant * len, y + len);
      ctx.stroke();

      // Near-layer splash hint as a drop meets the floor.
      if (layer.width > 1.2 && fall > h - 6 && fall < h + 6) {
        ctx.globalAlpha = 0.2 * flicker;
        ctx.beginPath();
        ctx.ellipse(x - slant * len, h - 1.5, 1.6 + profile.density, 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Cool wash scales with intensity so heavy rain dims the room slightly.
  if (profile.wash > 0) {
    ctx.globalAlpha = profile.wash;
    ctx.fillStyle = "#5d7396";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Soft drifting flakes — slower and rounder than rain streaks. */
export function drawSnow(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeSec: number,
  kind: RainKind = "snow",
  windBase = 0.3,
): void {
  const profile = RAIN_PROFILES[kind];
  const h = viewport.height;
  const w = viewport.width;
  const wind = rainWindAt(windBase, profile, timeSec);
  const count = Math.round(70 * profile.density);

  ctx.save();
  for (let i = 0; i < count; i++) {
    const seed = i * 23.7 + 11;
    const layer = i % 3;
    const r = 1.1 + layer * 0.7 + hash(seed + 3) * 0.8;
    const speed = 18 + layer * 16 + hash(seed + 5) * 22;
    const span = h + r * 4;
    const fall = (hash(seed + 1) * span + timeSec * speed) % span;
    const y = fall - r;
    const x =
      hash(seed + 2) * w +
      Math.sin(timeSec * 0.35 + seed) * (6 + layer * 4) +
      wind * 28 * (0.4 + layer * 0.2);
    const alpha = (0.35 + layer * 0.15) * profile.alphaMul;
    ctx.globalAlpha = Math.min(0.85, alpha);
    ctx.fillStyle = "#f4f7fb";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.85 + hash(seed + 7) * 0.25), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (profile.wash > 0) {
    ctx.globalAlpha = profile.wash * 0.85;
    ctx.fillStyle = "#c9d4e4";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Slowly advected, soft-edged mist with no discrete cloud outlines. */
export function drawFog(
  ctx: CanvasRenderingContext2D, viewport: Viewport, timeSec: number,
  kind: RainKind = "fog", windBase = 0,
): void {
  drawAtmosphere(ctx, viewport, timeSec, false, windBase, RAIN_PROFILES[kind].density);
}

/** Wind-carried dust haze and fine grains, mostly moving horizontally. */
export function drawSand(
  ctx: CanvasRenderingContext2D, viewport: Viewport, timeSec: number,
  kind: RainKind = "sand", windBase = 0.5,
): void {
  drawAtmosphere(ctx, viewport, timeSec, true, windBase, RAIN_PROFILES[kind].density);
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeSec: number,
  kind: RainKind,
  windBase: number,
): void {
  const family = RAIN_PROFILES[kind].family;
  if (family === "snow") drawSnow(ctx, viewport, timeSec, kind, windBase);
  else if (family === "fog") drawFog(ctx, viewport, timeSec, kind, windBase);
  else if (family === "sand") drawSand(ctx, viewport, timeSec, kind, windBase);
  else drawRain(ctx, viewport, timeSec, kind, windBase);
}

/** Full-screen lightning pulse for thunder storms (drawn above bugs). */
export function drawLightning(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  timeSec: number,
): void {
  const flash = lightningFlash(timeSec);
  if (flash <= 0.02) return;
  const w = viewport.width;
  const h = viewport.height;
  ctx.save();
  // Cool sky flash with a short afterglow tint.
  ctx.globalAlpha = Math.min(0.72, flash * 0.62);
  ctx.fillStyle = "#dfe9ff";
  ctx.fillRect(0, 0, w, h);
  if (flash > 0.5) {
    ctx.globalAlpha = (flash - 0.5) * 0.25;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Translucent insecticide mist sweeping top → bottom. */
function drawSprayMist(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  progress: number,
): void {
  const p = Math.min(1, Math.max(0, progress));
  const h = viewport.height;
  const band = h * 0.42;
  const headY = p * (h + band) - band * 0.2;
  const fade = p < 0.15 ? p / 0.15 : p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1;
  const grad = ctx.createLinearGradient(0, headY - band, 0, headY + band * 0.35);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.45, `rgba(248,250,255,${0.28 * fade})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, Math.max(0, headY - band), viewport.width, band * 1.4);
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  bugs: Bug[],
  stains: Stain[],
  particles: Particle[],
  baits: Bait[],
  floats: FloatText[],
  viewport: Viewport,
  rain: false | { kind: RainKind; wind: number } = false,
  timeSec = 0,
  sprayFx = 0,
): void {
  ctx.save();
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  for (const stain of stains) drawStain(ctx, stain);
  for (const bait of baits) drawBait(ctx, bait);
  for (const bug of bugs) drawBug(ctx, bug);
  drawParticles(ctx, particles);
  drawFloats(ctx, floats);
  if (rain) {
    drawWeather(ctx, viewport, timeSec, rain.kind, rain.wind);
    if (RAIN_PROFILES[rain.kind].lightning) {
      drawLightning(ctx, viewport, timeSec);
    }
  }
  if (sprayFx > 0) drawSprayMist(ctx, viewport, sprayFx);

  ctx.restore();
}