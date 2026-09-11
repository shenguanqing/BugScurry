import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";

registerSpecies({
  id: "fly",
  label: "苍蝇",
  emoji: "🪰",
  traits: {
    bodyScale: 0.7,
    speedMul: 1.4,
    edgeAffinity: 0.2,
    tint: "#3f3f46",
    stainColor: "#3f3f46",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 0.75;
    const phase = bug.legPhase * Math.PI * 2;
    ctx.globalAlpha = alpha;

    // Wings (blur-ish)
    ctx.save();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = "#e4e4e7";
    const flap = 0.35 + Math.sin(phase * 6) * 0.25;
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, -s * 0.45, s * 0.45, s * 0.18, -0.6 - flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-s * 0.05, s * 0.45, s * 0.45, s * 0.18, 0.6 + flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = Math.max(1, s * 0.05);
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * s * 0.15;
      const lift = Math.sin(phase + i) * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(along, -s * 0.08);
      ctx.lineTo(along + s * 0.2, -s * 0.45 + lift);
      ctx.moveTo(along, s * 0.08);
      ctx.lineTo(along + s * 0.2, s * 0.45 - lift);
      ctx.stroke();
    }

    ctx.fillStyle = "#3f3f46";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#52525b";
    ctx.beginPath();
    ctx.ellipse(s * 0.32, 0, s * 0.2, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Compound eyes
    ctx.fillStyle = "#a1a1aa";
    ctx.beginPath();
    ctx.arc(s * 0.42, -s * 0.1, s * 0.12, 0, Math.PI * 2);
    ctx.arc(s * 0.42, s * 0.1, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  },
});
