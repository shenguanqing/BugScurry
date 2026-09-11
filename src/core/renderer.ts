import type { Bug, Particle, Stain, Viewport } from "./types";

const BODY = "#4a3728";
const BODY_DARK = "#2c1e14";
const LEG = "#1a120c";
const EYE = "#1a120c";

function drawLeg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  lift: number,
): void {
  const midX = x + Math.cos(angle) * len * 0.55;
  const midY = y + Math.sin(angle) * len * 0.55;
  const endX = x + Math.cos(angle) * len;
  const endY = y + Math.sin(angle) * len + lift;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(midX, midY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
}

export function drawBug(ctx: CanvasRenderingContext2D, bug: Bug): void {
  let alpha = 1;
  let scaleX = 1;
  let scaleY = 1;
  let squashY = 0;

  if (bug.state === "squishing") {
    const t = bug.deathProgress;
    scaleX = 1 + t * 0.7;
    scaleY = Math.max(0.2, 1 - t * 0.75);
    squashY = t * bug.size * 0.18;
  } else if (bug.state === "dying") {
    const t = bug.deathProgress;
    scaleX = 1.7;
    scaleY = 0.2;
    alpha = 1 - t * t;
    squashY = bug.size * 0.18;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(bug.x, bug.y + squashY);
  ctx.rotate(bug.heading);
  ctx.scale(scaleX, scaleY);

  const s = bug.size;
  const phase = bug.legPhase * Math.PI * 2;
  const legActive = bug.state === "crawling" || bug.state === "paused";

  ctx.strokeStyle = LEG;
  ctx.lineWidth = Math.max(1, s * 0.075);
  ctx.lineCap = "round";

  if (legActive) {
    const legLen = s * 0.98;
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * s * 0.24;
      const liftL = Math.sin(phase + i * 1.2) * s * 0.14;
      const liftR = Math.sin(phase + i * 1.2 + Math.PI) * s * 0.14;
      drawLeg(ctx, along, -s * 0.16, -0.95 - i * 0.12, legLen, liftL);
      drawLeg(ctx, along, s * 0.16, 0.95 + i * 0.12, legLen, liftR);
    }
  }

  // Abdomen
  const grad = ctx.createLinearGradient(-s * 0.7, 0, s * 0.3, 0);
  grad.addColorStop(0, "#3a2a1c");
  grad.addColorStop(0.5, BODY);
  grad.addColorStop(1, "#5a4332");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, 0, s * 0.58, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing sheen
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, 0, s * 0.42, s * 0.13, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Thorax
  ctx.fillStyle = BODY_DARK;
  ctx.beginPath();
  ctx.ellipse(s * 0.22, 0, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.ellipse(s * 0.5, 0, s * 0.18, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.arc(s * 0.57, -s * 0.08, s * 0.045, 0, Math.PI * 2);
  ctx.arc(s * 0.57, s * 0.08, s * 0.045, 0, Math.PI * 2);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = LEG;
  ctx.lineWidth = Math.max(1, s * 0.055);
  const antWave = Math.sin(phase * 1.4) * 0.18;
  ctx.beginPath();
  ctx.moveTo(s * 0.62, -s * 0.05);
  ctx.quadraticCurveTo(s * 1.0, -s * 0.28 + antWave * s, s * 1.2, -s * 0.12);
  ctx.moveTo(s * 0.62, s * 0.05);
  ctx.quadraticCurveTo(s * 1.0, s * 0.28 - antWave * s, s * 1.2, s * 0.12);
  ctx.stroke();

  ctx.restore();
}

export function drawStain(ctx: CanvasRenderingContext2D, stain: Stain): void {
  const t = 1 - stain.life / stain.maxLife;
  const alpha = Math.max(0, 0.38 * (1 - t * t));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#3b2a1a";
  ctx.beginPath();
  ctx.ellipse(stain.x, stain.y, stain.size * 1.2, stain.size * 0.7, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.ellipse(
    stain.x + stain.size * 0.35,
    stain.y - stain.size * 0.15,
    stain.size * 0.45,
    stain.size * 0.28,
    -0.3,
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
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = "#5c4030";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
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
