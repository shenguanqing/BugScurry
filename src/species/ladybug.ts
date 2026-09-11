import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { antennae, ellipse, legs, line, shell } from "./drawing";

registerSpecies({
  id: "ladybug",
  label: "瓢虫",
  emoji: "🐞",
  traits: {
    bodyScale: 1,
    speedMul: 0.9,
    edgeAffinity: 0.4,
    tint: "#b91c1c",
    stainColor: "#7f1d1d",
    fluidColor: "#dca34ac4",
    fluidHighlight: "#ffe6aedf",
    fluidShadow: "#a4743599",
  },
  draw(ctx, bug: Bug, alpha: number) {
    // Calibrated by body mass, excluding legs, wings and antennae.
    const s = bug.size * 0.85;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    legs(ctx, phase, 3, 0.61, "#262321", false, pressure);
    antennae(ctx, phase, 0.62, 0.21, 0.2, "#292524", true);
    shell(ctx, 0.5, 0, 0.21, 0.19, "#5c5b55", "#252724", "#101511", pressure);
    shell(ctx, 0.3, 0, 0.25, 0.32, "#5a5e57", "#252925", "#111713", pressure);

    shell(ctx, -0.1, 0, 0.53, 0.52, "#ffbe6e", "#ed4321", "#881b12", pressure);
    line(ctx, "#631b18", 0.026, -0.62, 0, 0.43, 0);
    for (const side of [-1, 1]) {
      ellipse(ctx, -0.37, side * 0.23, 0.105, 0.095, "#211e1b");
      ellipse(ctx, -0.05, side * 0.31, 0.12, 0.1, "#211e1b");
      ellipse(ctx, 0.23, side * 0.2, 0.08, 0.08, "#211e1b");
    }
    ellipse(ctx, -0.51, 0, 0.085, 0.09, "#211e1b");
    ellipse(ctx, -0.19, -0.28, 0.22, 0.10, "#fff5df88", -0.35);
    ellipse(ctx, -0.14, 0.30, 0.16, 0.055, "#fff0cf77", 0.2);
    // White pronotal patches remain visible above the red wing cases.
    for (const side of [-1, 1]) ellipse(ctx, 0.40, side * 0.22, 0.105, 0.073, "#eceee6", side * -0.5);
    ellipse(ctx, 0.12, 0.34, 0.13, 0.024, "#ffcfad44", -0.2);
    ctx.restore();
  },
});
