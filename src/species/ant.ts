import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";

registerSpecies({
  id: "ant",
  label: "蚂蚁",
  emoji: "🐜",
  traits: {
    bodyScale: 0.75,
    speedMul: 1.15,
    edgeAffinity: 0.35,
    tint: "#7f1d1d",
    stainColor: "#7f1d1d",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 0.78;
    const phase = bug.legPhase * Math.PI * 2;
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = "#1c0a0a";
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * s * 0.28;
      const lift = Math.sin(phase + i) * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(along, -s * 0.08);
      ctx.lineTo(along + s * 0.25, -s * 0.55 + lift);
      ctx.moveTo(along, s * 0.08);
      ctx.lineTo(along + s * 0.25, s * 0.55 - lift);
      ctx.stroke();
    }

    ctx.fillStyle = "#3f1515";
    ctx.beginPath();
    ctx.ellipse(-s * 0.35, 0, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.2, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#450a0a";
    ctx.beginPath();
    ctx.ellipse(s * 0.32, 0, s * 0.16, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#1c0a0a";
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(s * 0.42, -s * 0.04);
    ctx.quadraticCurveTo(s * 0.7, -s * 0.35, s * 0.9, -s * 0.2);
    ctx.moveTo(s * 0.42, s * 0.04);
    ctx.quadraticCurveTo(s * 0.7, s * 0.35, s * 0.9, s * 0.2);
    ctx.stroke();
  },
});
