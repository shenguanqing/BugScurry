import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

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
      const x = -0.66 + i * 0.175;
      const y = -0.10 * Math.sin(t * Math.PI) + Math.sin(phase - i * 0.7) * 0.025 * (1 - pressure);
      const r = 0.15 + Math.sin(t * Math.PI) * 0.055;
      const sy = 1 - pressure * 0.45;
      ellipse(ctx, x + 0.02, y + r * sy, 0.05, 0.075 * sy, "#ae813c");
      shell(ctx, x, y, r * 0.9, r * sy, "#e9f598", "#9bbb49", "#4f6e28", pressure);
      line(ctx, "#d7ea8daa", 0.018, x - 0.04, y + 0.05, x + 0.06, y + 0.075);
      ellipse(ctx, x + 0.02, y + 0.055, 0.019, 0.023, "#343b1b");
      for (let j = 0; j < 5; j++) {
        const a = Math.PI * (1.1 + j * 0.18);
        const length = 0.045 + (j % 2) * 0.025;
        line(ctx, "#8a924a99", 0.01, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * sy,
          x + Math.cos(a) * (r + length), y + Math.sin(a) * (r + length) * sy);
      }
    }
    const hy = -0.20 + Math.sin(phase) * 0.02 * (1 - pressure);
    shell(ctx, 0.52, hy, 0.23, 0.24, "#ffe6a2", "#e9a147", "#a2632b", pressure);
    ellipse(ctx, 0.62, hy - 0.025, 0.046, 0.055, "#282a19");
    ellipse(ctx, 0.63, hy - 0.043, 0.015, 0.018, "#fff4dc");
    line(ctx, "#6e4926", 0.018, 0.68, hy + 0.10, 0.63, hy + 0.13, 0.59, hy + 0.11);
    for (const shift of [0, 0.12]) {
      line(ctx, "#42422a", 0.026, 0.47 + shift, hy - 0.19, 0.48 + shift, hy - 0.32, 0.40 + shift, hy - 0.34);
      ellipse(ctx, 0.40 + shift, hy - 0.34, 0.043, 0.022, "#3b3c29");
    }
    ctx.restore();
  },
});
