import type { Bug, Viewport } from "./types";

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

export function drawBug(
  ctx: CanvasRenderingContext2D,
  bug: Bug,
): void {
  let alpha = 1;
  let scaleX = 1;
  let scaleY = 1;
  let squashY = 0;

  if (bug.state === "squishing") {
    const t = bug.deathProgress;
    scaleX = 1 + t * 0.55;
    scaleY = Math.max(0.25, 1 - t * 0.7);
    squashY = t * bug.size * 0.15;
  } else if (bug.state === "dying") {
    const t = bug.deathProgress;
    scaleX = 1.55;
    scaleY = 0.25;
    alpha = 1 - t;
    squashY = bug.size * 0.15;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(bug.x, bug.y + squashY);
  ctx.rotate(bug.heading);
  ctx.scale(scaleX, scaleY);

  const s = bug.size;
  const phase = bug.legPhase * Math.PI * 2;

  // Shadow-ish stain under dying bug
  if (bug.state === "dying" || bug.state === "squishing") {
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha * 0.35);
    ctx.fillStyle = "#3a2a1a";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.1, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = LEG;
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.lineCap = "round";

  // 6 legs
  const legLen = s * 0.95;
  for (let i = 0; i < 3; i++) {
    const along = (i - 1) * s * 0.22;
    const liftL = Math.sin(phase + i * 1.1) * s * 0.12;
    const liftR = Math.sin(phase + i * 1.1 + Math.PI) * s * 0.12;
    drawLeg(ctx, along, -s * 0.15, -0.9 - i * 0.15, legLen, liftL);
    drawLeg(ctx, along, s * 0.15, 0.9 + i * 0.15, legLen, liftR);
  }

  // Abdomen
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, 0, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thorax
  ctx.fillStyle = BODY_DARK;
  ctx.beginPath();
  ctx.ellipse(s * 0.2, 0, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.ellipse(s * 0.48, 0, s * 0.18, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings sheen
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-s * 0.2, 0, s * 0.4, s * 0.12, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.08, s * 0.05, 0, Math.PI * 2);
  ctx.arc(s * 0.55, s * 0.08, s * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = LEG;
  ctx.lineWidth = Math.max(1, s * 0.06);
  const antWave = Math.sin(phase * 1.5) * 0.15;
  ctx.beginPath();
  ctx.moveTo(s * 0.6, -s * 0.06);
  ctx.quadraticCurveTo(
    s * 0.95,
    -s * 0.25 + antWave * s,
    s * 1.15,
    -s * 0.15,
  );
  ctx.moveTo(s * 0.6, s * 0.06);
  ctx.quadraticCurveTo(
    s * 0.95,
    s * 0.25 - antWave * s,
    s * 1.15,
    s * 0.15,
  );
  ctx.stroke();

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  bugs: Bug[],
  viewport: Viewport,
): void {
  ctx.save();
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  for (const bug of bugs) {
    drawBug(ctx, bug);
  }

  ctx.restore();
}
