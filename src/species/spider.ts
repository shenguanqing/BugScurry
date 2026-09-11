import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";

registerSpecies({
  id: "spider",
  label: "蜘蛛",
  emoji: "🕷",
  traits: {
    bodyScale: 0.95,
    speedMul: 0.85,
    edgeAffinity: 0.45,
    tint: "#292524",
    stainColor: "#292524",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size;
    const phase = bug.legPhase * Math.PI * 2;
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) * 0.35;
      const lift = Math.sin(phase + i * 0.9) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.12);
      ctx.quadraticCurveTo(s * t * 0.3, -s * 0.7, s * t * 0.85, -s * 0.95 + lift);
      ctx.moveTo(0, s * 0.12);
      ctx.quadraticCurveTo(s * t * 0.3, s * 0.7, s * t * 0.85, s * 0.95 - lift);
      ctx.stroke();
    }

    // Abdomen + cephalothorax
    const g = ctx.createRadialGradient(-s * 0.1, 0, 1, -s * 0.1, 0, s * 0.55);
    g.addColorStop(0, "#57534e");
    g.addColorStop(1, "#1c1917");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-s * 0.25, 0, s * 0.42, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.22, 0, s * 0.22, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye cluster
    ctx.fillStyle = "#f5f5f4";
    for (let i = 0; i < 4; i++) {
      const ex = s * 0.32 + (i % 2) * s * 0.08;
      const ey = (i < 2 ? -1 : 1) * s * 0.05 + (i % 2 ? s * 0.04 : -s * 0.04);
      ctx.beginPath();
      ctx.arc(ex, ey, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#000";
    for (let i = 0; i < 4; i++) {
      const ex = s * 0.32 + (i % 2) * s * 0.08;
      const ey = (i < 2 ? -1 : 1) * s * 0.05 + (i % 2 ? s * 0.04 : -s * 0.04);
      ctx.beginPath();
      ctx.arc(ex, ey, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});
