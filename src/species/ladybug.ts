import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";

registerSpecies({
  id: "ladybug",
  label: "瓢虫",
  emoji: "🐞",
  traits: {
    bodyScale: 0.85,
    speedMul: 0.9,
    edgeAffinity: 0.4,
    tint: "#b91c1c",
    stainColor: "#7f1d1d",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 0.9;
    const phase = bug.legPhase * Math.PI * 2;
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = Math.max(1, s * 0.06);
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * s * 0.2;
      const lift = Math.sin(phase + i) * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(along, -s * 0.15);
      ctx.lineTo(along + s * 0.15, -s * 0.7 + lift);
      ctx.moveTo(along, s * 0.15);
      ctx.lineTo(along + s * 0.15, s * 0.7 - lift);
      ctx.stroke();
    }

    // Shell
    const g = ctx.createRadialGradient(-s * 0.05, -s * 0.1, 1, 0, 0, s * 0.55);
    g.addColorStop(0, "#ef4444");
    g.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center line
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.45, 0);
    ctx.lineTo(-s * 0.45, 0);
    ctx.stroke();

    // Spots
    ctx.fillStyle = "#111";
    const spots = [
      [-0.15, -0.15],
      [0.1, -0.18],
      [-0.1, 0.18],
      [0.15, 0.12],
      [-0.3, 0],
    ];
    for (const [sx, sy] of spots) {
      ctx.beginPath();
      ctx.arc(sx * s, sy * s, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head
    ctx.fillStyle = "#1c1917";
    ctx.beginPath();
    ctx.ellipse(s * 0.48, 0, s * 0.16, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  },
});
