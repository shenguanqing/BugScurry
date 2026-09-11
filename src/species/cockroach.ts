import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, legs, line, shell } from "./drawing";

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
    fluidColor: "#c1b66dbd",
    fluidHighlight: "#f7edc6dc",
    fluidShadow: "#897d4299",
  },
  draw(ctx, bug: Bug, alpha: number) {
    // Calibrated by body mass, excluding legs, wings and antennae.
    const s = bug.size * 1.10;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s * 0.78);
    ctx.globalAlpha = alpha;
    legs(ctx, phase, 3, 0.66, "#885143", true, pressure);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.56, side * 0.09);
      ctx.bezierCurveTo(1.12, side * 0.55, 1.20, side * 0.72, 0.88, side * (0.81 + Math.sin(phase * 0.4) * 0.025));
      ctx.strokeStyle = "#cfb3a080";
      ctx.lineWidth = 0.033;
      ctx.stroke();
      ctx.strokeStyle = "#875d50";
      ctx.lineWidth = 0.016;
      ctx.stroke();
    }
    line(ctx, "#654026", 0.03, -0.64, -0.12, -0.83, -0.2);
    line(ctx, "#654026", 0.03, -0.64, 0.12, -0.83, 0.2);
    shell(ctx, -0.19, 0, 0.65, 0.27, "#a86655", "#4c2023", "#24151b", pressure);
    // Paired leathery forewings and fine longitudinal veins.
    for (const side of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        const y = side * i * 0.052;
        ctx.strokeStyle = "#c77c6333";
        ctx.lineWidth = 0.013;
        ctx.beginPath();
        ctx.moveTo(0.12, y * 0.5);
        ctx.quadraticCurveTo(-0.25, y, -0.62 + i * 0.035, y * 0.7);
        ctx.stroke();
      }
    }
    line(ctx, "#21151d", 0.02, 0.2, 0, -0.69, 0);
    shell(ctx, 0.48, 0, 0.17, 0.15, "#956337", "#53351e", "#2f2117", pressure);
    shell(ctx, 0.24, 0, 0.20, 0.22, "#d0a385", "#82564b", "#44292c", pressure);
    ellipse(ctx, 0.26, 0, 0.125, 0.14, "#3d242a");
    ellipse(ctx, 0.52, -0.11, 0.052, 0.035, "#161611");
    ellipse(ctx, 0.52, 0.11, 0.052, 0.035, "#161611");
    ctx.restore();
  },
});
