import { getSpecies } from "../species";
import type { Bug, Particle, Stain, Viewport } from "./types";

function applySquishTransform(ctx: CanvasRenderingContext2D, bug: Bug): number {
  let alpha = 1;
  let scaleX = 1;
  let scaleY = 1;
  let squashY = 0;
  let rotationJitter = 0;

  if (bug.state === "squishing") {
    const t = bug.deathProgress;
    // Elastic flatten: overshoot thin then settle a bit
    const ease = 1 - Math.pow(1 - t, 3);
    const over = Math.sin(t * Math.PI) * 0.25;
    scaleX = 1 + ease * 0.95 + over;
    scaleY = Math.max(0.12, 1 - ease * 0.88);
    squashY = ease * bug.size * 0.22;
    rotationJitter = (bug.seed - 0.5) * 0.4 * (1 - ease);
  } else if (bug.state === "dying") {
    const t = bug.deathProgress;
    scaleX = 1.95;
    scaleY = 0.12;
    squashY = bug.size * 0.24;
    // Hold stamp for a beat, then fade
    alpha = t < 0.15 ? 1 : 1 - (t - 0.15) / 0.85;
    alpha = Math.max(0, alpha);
    rotationJitter = 0;
  }

  ctx.translate(bug.x, bug.y + squashY);
  ctx.rotate(bug.heading + rotationJitter);
  ctx.scale(scaleX, scaleY);
  return Math.max(0, alpha);
}

export function drawBug(ctx: CanvasRenderingContext2D, bug: Bug): void {
  ctx.save();
  const alpha = applySquishTransform(ctx, bug);
  ctx.globalAlpha = alpha;

  const species = getSpecies(bug.species);
  if (species) {
    // Legs collapse quickly during squish
    const dying = bug.state === "squishing" || bug.state === "dying";
    if (dying && bug.deathProgress > 0.35) {
      // Draw only a flattened body blob
      const s = bug.size;
      ctx.fillStyle = species.traits.tint;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.7, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = "#1c1917";
      ctx.beginPath();
      ctx.ellipse(s * 0.25, 0, s * 0.25, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      species.draw(ctx, bug, alpha);
    }
  }

  // Impact ring flash on first part of squish
  if (bug.state === "squishing" && bug.deathProgress < 0.45) {
    const t = bug.deathProgress / 0.45;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.45;
    ctx.strokeStyle = "#fff7ed";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, bug.size * (0.6 + t * 1.4), bug.size * (0.35 + t * 0.7), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawStain(ctx: CanvasRenderingContext2D, stain: Stain): void {
  const t = 1 - stain.life / stain.maxLife;
  const alpha = Math.max(0, 0.42 * (1 - t * t));
  const species = getSpecies(stain.species);
  const color = species?.traits.stainColor ?? "#3b2a1a";

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  // Organic splat
  ctx.beginPath();
  ctx.ellipse(stain.x, stain.y, stain.size * 1.35, stain.size * 0.72, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.ellipse(
    stain.x + stain.size * 0.4,
    stain.y - stain.size * 0.2,
    stain.size * 0.5,
    stain.size * 0.3,
    -0.4,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    stain.x - stain.size * 0.35,
    stain.y + stain.size * 0.15,
    stain.size * 0.35,
    stain.size * 0.22,
    0.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.size * a), 0, Math.PI * 2);
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
