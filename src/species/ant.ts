import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

registerSpecies({
  id: "ant",
  label: "蚂蚁",
  emoji: "🐜",
  traits: {
    bodyScale: 1,
    speedMul: 1.15,
    edgeAffinity: 0.35,
    tint: "#7f1d1d",
    stainColor: "#7f1d1d",
    fluidColor: "#d0c585ad",
    fluidHighlight: "#fcf3d3d4",
    fluidShadow: "#998b5390",
  },
  draw(ctx, bug: Bug, alpha: number) {
    // Calibrated by body mass, excluding legs, wings and antennae.
    const s = bug.size * 1.00;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Side-view silhouette: six legs descend beneath a raised head and gaster.
    for (const back of [true, false]) {
      for (let i = 0; i < 3; i++) {
        const rootX = 0.13 - i * 0.14;
        const stride = Math.sin(phase + i * Math.PI + (back ? Math.PI : 0)) * 0.075;
        const kneeX = rootX + (1 - i) * 0.2 + (back ? -0.07 : 0.03) + stride;
        const footX = kneeX + (1 - i) * 0.14 - pressure * 0.09;
        const footY = (back ? 0.43 : 0.56) * (1 - pressure * 0.6);
        line(ctx, back ? "#494442" : "#282526", back ? 0.045 : 0.058,
          rootX, 0.025, kneeX, 0.25, footX, footY);
        line(ctx, "#aaa09c88", 0.014, rootX, 0.01, kneeX, 0.23, footX, footY - 0.02);
      }
    }
    line(ctx, "#292527", 0.065, -0.33, -0.015, 0.15, -0.05);
    shell(ctx, -0.46, -0.07, 0.36, 0.29, "#958588", "#3d3338", "#171417", pressure);
    ellipse(ctx, -0.58, -0.19, 0.075, 0.16, "#d6c5c32b", -0.35);
    shell(ctx, -0.15, -0.03, 0.075, 0.075, "#a59694", "#453a3e", "#1a171a", pressure);
    shell(ctx, 0.06, -0.13, 0.18, 0.16, "#8b8182", "#393237", "#181519", pressure);
    shell(ctx, 0.37, -0.26, 0.235, 0.265, "#a49798", "#3a3238", "#141216", pressure);
    ellipse(ctx, 0.43, -0.31, 0.088, 0.105, "#151317", 0.25);
    ellipse(ctx, 0.46, -0.35, 0.025, 0.036, "#eee6e0b0", 0.25);
    for (const offset of [0, 0.10]) {
      const sway = Math.sin(phase * 0.5 + offset * 10) * 0.03;
      ctx.beginPath();
      ctx.moveTo(0.42 - offset, -0.47);
      ctx.bezierCurveTo(0.60 - offset, -0.70, 0.59 - offset, -0.86, 0.36 - offset + sway, -0.79);
      ctx.strokeStyle = "#d4cbbc66";
      ctx.lineWidth = 0.042;
      ctx.stroke();
      ctx.strokeStyle = "#4d4448";
      ctx.lineWidth = 0.023;
      ctx.stroke();
    }
    line(ctx, "#393036", 0.03, 0.56, -0.19, 0.63, -0.14, 0.57, -0.11);
    ctx.restore();
  },
});
