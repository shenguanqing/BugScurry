import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";

function drawLegs(
  ctx: CanvasRenderingContext2D,
  s: number,
  phase: number,
  pairs: number,
  spread: number,
): void {
  ctx.lineCap = "round";
  for (let i = 0; i < pairs; i++) {
    const along = (i - (pairs - 1) / 2) * s * 0.22;
    const liftL = Math.sin(phase + i * 1.2) * s * 0.12;
    const liftR = Math.sin(phase + i * 1.2 + Math.PI) * s * 0.12;
    const len = s * spread;
    // left
    ctx.beginPath();
    ctx.moveTo(along, -s * 0.12);
    ctx.lineTo(along + len * 0.35, -s * 0.12 - len * 0.55 + liftL);
    ctx.lineTo(along + len * 0.15, -s * 0.12 - len + liftL);
    ctx.stroke();
    // right
    ctx.beginPath();
    ctx.moveTo(along, s * 0.12);
    ctx.lineTo(along + len * 0.35, s * 0.12 + len * 0.55 + liftR);
    ctx.lineTo(along + len * 0.15, s * 0.12 + len + liftR);
    ctx.stroke();
  }
}

registerSpecies({
  id: "cockroach",
  label: "蟑螂",
  emoji: "🪳",
  traits: {
    bodyScale: 1,
    speedMul: 1,
    edgeAffinity: 0.55,
    tint: "#5c4030",
    stainColor: "#3b2a1a",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size;
    const phase = bug.legPhase * Math.PI * 2;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#1a120c";
    ctx.lineWidth = Math.max(1, s * 0.07);
    drawLegs(ctx, s, phase, 3, 0.95);

    const grad = ctx.createLinearGradient(-s * 0.7, 0, s * 0.3, 0);
    grad.addColorStop(0, "#3a2a1c");
    grad.addColorStop(0.5, "#4a3728");
    grad.addColorStop(1, "#6a4e38");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-s * 0.18, 0, s * 0.58, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-s * 0.22, 0, s * 0.4, s * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#2c1e14";
    ctx.beginPath();
    ctx.ellipse(s * 0.22, 0, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.5, 0, s * 0.18, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(s * 0.57, -s * 0.07, s * 0.04, 0, Math.PI * 2);
    ctx.arc(s * 0.57, s * 0.07, s * 0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#1a120c";
    ctx.lineWidth = Math.max(1, s * 0.05);
    const w = Math.sin(phase * 1.4) * 0.15;
    ctx.beginPath();
    ctx.moveTo(s * 0.62, -s * 0.04);
    ctx.quadraticCurveTo(s, -s * 0.25 + w * s, s * 1.15, -s * 0.1);
    ctx.moveTo(s * 0.62, s * 0.04);
    ctx.quadraticCurveTo(s, s * 0.25 - w * s, s * 1.15, s * 0.1);
    ctx.stroke();
  },
});
