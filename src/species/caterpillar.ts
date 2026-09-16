import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, glossyEye } from "./drawing";

registerSpecies({
  id: "caterpillar",
  label: "毛毛虫",
  emoji: "🐛",
  traits: {
    favoriteFood: "fruit",
    eatStyle: "ripple",
    activity: "diurnal",
    bodyScale: 1,
    speedMul: 0.55,
    edgeAffinity: 0.7,
    tint: "#4d7c0f",
    stainColor: "#3f6212",
    fluidColor: "#a3c94ac4",
    fluidHighlight: "#e4f5a8df",
    fluidShadow: "#6b8f2e99",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(bug.size, bug.size);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Seven soft segments with a traveling contraction wave and tiny prolegs.
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = -0.62 + i * 0.155 + 0.10 * Math.sin(t * Math.PI);
      const y = 0.34 - t * 0.70 + 0.13 * Math.sin(t * Math.PI * 2) + Math.sin(phase - i * 0.7) * 0.025 * (1 - pressure);
      const r = 0.22 + Math.sin(t * Math.PI) * 0.07;
      const sy = 1 - pressure * 0.45;
      ellipse(ctx, x + 0.02, y + r * sy, 0.05, 0.075 * sy, "#ae813c");
      shell(ctx, x, y, r * 0.86, r * sy, "#f1ffaf", "#a8ce32", "#34481a", pressure);
      // Curving shaded segment seam, with tiny raised yellow-green tubercles.
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r * sy, 0, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y - r);
      ctx.bezierCurveTo(x - r * 0.9, y, x - r * 0.5, y + r, x + r * 0.35, y + r);
      ctx.strokeStyle = "#344c1cc9"; ctx.lineWidth = r * 0.26; ctx.stroke();
      for (let j = 0; j < 5; j++) {
        const a = j * 1.55 + i * 0.7;
        const px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.65 * sy;
        ellipse(ctx, px, py, 0.022, 0.028 * sy, "#587823");
        ellipse(ctx, px + 0.006, py - 0.013, 0.013, 0.017 * sy, "#eaff9ccc");
      }
      ctx.restore();
      for (let j = 0; j < 8; j++) {
        const a = Math.PI * (1.1 + j * 0.11);
        const length = 0.045 + (j % 2) * 0.025;
        line(ctx, "#a5be49cc", 0.012, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * sy,
          x + Math.cos(a) * (r + length), y + Math.sin(a) * (r + length) * sy);
      }
    }
    const hy = -0.46 + Math.sin(phase) * 0.02 * (1 - pressure);
    shell(ctx, 0.43, hy, 0.23, 0.24, "#ffe48d", "#f2a21f", "#a5480c", pressure);
    glossyEye(ctx, 0.53, hy - 0.025, 0.05, 0.063, pressure);

    const feelerSway = Math.sin(phase * 0.5) * 0.018 * (1 - pressure);
    for (const shift of [0, 0.12]) {
      ctx.beginPath(); ctx.moveTo(0.38 + shift, hy - 0.20);
      ctx.quadraticCurveTo(0.43 + shift, hy - 0.37, 0.27 + shift + feelerSway, hy - 0.30);
      ctx.strokeStyle = "#303125"; ctx.lineWidth = 0.055; ctx.stroke();

    }
    ctx.restore();
  },
});
