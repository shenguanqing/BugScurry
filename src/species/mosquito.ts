import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

registerSpecies({
  id: "mosquito",
  label: "蚊子",
  emoji: "🦟",
  traits: {
    bodyScale: 1,
    speedMul: 1.5,
    edgeAffinity: 0.1,
    tint: "#57534e",
    stainColor: "#44403c",
    fluidColor: "#d6c8b877",
    fluidHighlight: "#f5efe6e0",
    fluidShadow: "#8a7e7266",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(bug.size, bug.size);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Side-view mosquito: humped thorax, hanging abdomen, six fine stilt legs.
    for (const far of [true, false]) {
      for (let i = 0; i < 3; i++) {
        const root = 0.18 - i * 0.11;
        const step = Math.sin(phase + i * 2.1 + (far ? Math.PI : 0)) * 0.04 * (1 - pressure);
        const knee = root + 0.21 - i * 0.27 + step;
        line(ctx, far ? "#7c7264" : "#494035", 0.027, root, -0.07, knee, 0.34,
          knee + 0.16 - i * 0.20, 0.73 - pressure * 0.22);
      }
    }
    ctx.save(); ctx.translate(-0.17, -0.04); ctx.rotate(-0.48);
    shell(ctx, -0.30, 0, 0.43, 0.135, "#a38b71", "#66513e", "#332820", pressure);
    for (let i = 0; i < 5; i++) {
      const x = -0.59 + i * 0.13;
      line(ctx, "#b19b7888", 0.015, x, -0.095, x - 0.015, 0, x, 0.095);
    }
    ctx.restore();
    // Long narrow wings swept back over the body.
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.translate(0.08, -0.20);
      ctx.rotate(0.17 + i * 0.20 + Math.sin(phase * 3) * 0.03 * (1 - pressure));
      const g = ctx.createLinearGradient(0, 0, -0.78, -0.24);
      g.addColorStop(0, "#d4c8a377"); g.addColorStop(1, "#c5b58eaa");
      ellipse(ctx, -0.34, -0.12, 0.44, 0.073, g, 0.28);
      line(ctx, "#a08f6d88", 0.01, 0, 0, -0.36, -0.12, -0.74, -0.22);
      ctx.restore();
    }
    shell(ctx, 0.15, -0.15, 0.18, 0.235, "#a89b86", "#635748", "#302a23", pressure);
    shell(ctx, 0.42, -0.08, 0.13, 0.145, "#9f9480", "#595040", "#24271f", pressure);
    ellipse(ctx, 0.46, -0.095, 0.077, 0.105, "#23281f");
    ellipse(ctx, 0.475, -0.13, 0.023, 0.036, "#c9cfb599");
    line(ctx, "#504635", 0.022, 0.50, 0, 0.83, 0.48);
    for (const shift of [0, 0.075]) {
      line(ctx, "#6a5b42", 0.016, 0.45 - shift, -0.17, 0.64 - shift, -0.44);
      for (let j = 1; j < 5; j++) {
        const x = 0.45 - shift + j * 0.038, y = -0.17 - j * 0.054;
        line(ctx, "#a08f7055", 0.008, x, y, x + 0.04, y + 0.014);
      }
    }
    ctx.restore();
  },
});
