import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

registerSpecies({
  id: "bee",
  label: "蜜蜂",
  emoji: "🐝",
  traits: {
    favoriteFood: "sugar",
    eatStyle: "hover",
    activity: "diurnal",
    bodyScale: 1,
    speedMul: 1.25,
    edgeAffinity: 0.25,
    tint: "#ca8a04",
    stainColor: "#a16207",
    fluidColor: "#e8c547c4",
    fluidHighlight: "#fff3a8df",
    fluidShadow: "#a8842e99",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(bug.size, bug.size);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Side profile: rounded striped abdomen, raised head and swept-back wings.
    for (const far of [true, false]) {
      for (let i = 0; i < 3; i++) {
        const x = 0.22 - i * 0.26;
        const step = Math.sin(phase + i * 2.1 + (far ? Math.PI : 0)) * 0.06 * (1 - pressure);
        line(ctx, far ? "#65542c" : "#332a18", 0.042, x, 0.13, x - 0.05 + step, 0.37,
          x - 0.20 + step, 0.45 - pressure * 0.12);
      }
    }
    line(ctx, "#292316", 0.045, -0.63, 0.06, -0.83, 0.13);
    shell(ctx, -0.25, 0.01, 0.50, 0.33, "#fff790", "#f0cd39", "#a5771b", pressure);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-0.25, 0.01, 0.50, 0.33, 0, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 3; i++) {
      const x = -0.63 + i * 0.27;
      ctx.beginPath(); ctx.moveTo(x, -0.34);
      ctx.bezierCurveTo(x - 0.13, -0.08, x - 0.07, 0.20, x + 0.04, 0.36);
      ctx.lineTo(x + 0.18, 0.36);
      ctx.bezierCurveTo(x + 0.06, 0.12, x + 0.02, -0.14, x + 0.14, -0.34);
      ctx.closePath(); ctx.fillStyle = "#292720"; ctx.fill();
    }
    ellipse(ctx, -0.24, -0.17, 0.37, 0.055, "#fffad75c"); ctx.restore();
    shell(ctx, 0.22, -0.06, 0.23, 0.28, "#fff19c", "#d1ab37", "#7e6828", pressure);
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI * 2 / 20;
      line(ctx, "#dfc16e99", 0.01, 0.22 + Math.cos(a)*0.21, -0.06 + Math.sin(a)*0.25,
        0.22 + Math.cos(a)*0.255, -0.06 + Math.sin(a)*0.295);
    }
    // Two overlapping translucent wings rise above the back.
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.translate(0.08, -0.23);
      ctx.rotate(-0.10 + i * 0.28 + Math.sin(phase * 3) * 0.055 * (1 - pressure));
      const g = ctx.createLinearGradient(0, 0, -0.65, -0.46);
      g.addColorStop(0, "#f1edc688"); g.addColorStop(1, "#b9b5a1bf");
      ellipse(ctx, -0.34, -0.20, 0.44, 0.18, g, 0.47);
      line(ctx, "#aaa68d66", 0.01, 0, 0, -0.37, -0.22, -0.68, -0.34);
      ctx.restore();
    }
    shell(ctx, 0.49, -0.10, 0.20, 0.25, "#96876b", "#3c392b", "#191c15", pressure);
    ellipse(ctx, 0.55, -0.12, 0.11, 0.17, "#171c18", 0.1);
    ellipse(ctx, 0.58, -0.18, 0.035, 0.06, "#bfc9b799", 0.15);
    for (const shift of [0, 0.10]) {
      ctx.beginPath(); ctx.moveTo(0.48 - shift, -0.30);
      ctx.bezierCurveTo(0.61 - shift, -0.60, 0.60 - shift, -0.65, 0.37 - shift, -0.63);
      ctx.strokeStyle = "#6e623a"; ctx.lineWidth = 0.023; ctx.stroke();
    }
    ctx.restore();
  },
});
