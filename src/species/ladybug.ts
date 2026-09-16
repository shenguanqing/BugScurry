import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

registerSpecies({
  id: "ladybug",
  label: "瓢虫",
  emoji: "🐞",
  traits: {
    favoriteFood: "fruit",
    eatStyle: "munch",
    activity: "diurnal",
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
    const s = bug.size * 1.03;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    const roots = [0.22, -0.02, -0.28];
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const step = Math.sin(phase + i * Math.PI + side) * 0.035 * (1 - pressure);
        const x = roots[i];
        const knee = x + (i === 0 ? 0.02 : -0.16) + step;
        line(ctx, "#282d28", 0.047, x, side * 0.34, knee, side * 0.53);
        line(ctx, "#282d28", 0.026, knee, side * 0.53, x - 0.25 + step,
          side * (0.69 - pressure * 0.22));
      }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const side of [-1, 1]) {
      const sway = Math.sin(phase * 0.5 + side) * 0.025 * (1 - pressure);
      ctx.beginPath(); ctx.moveTo(0.42, side * 0.24);
      ctx.bezierCurveTo(0.54, side * 0.40, 0.65, side * 0.40, 0.71, side * (0.55 + sway));
      ctx.strokeStyle = "#353b35"; ctx.lineWidth = 0.031; ctx.stroke();
      ellipse(ctx, 0.71, side * (0.55 + sway), 0.031, 0.022, "#333932");
    }
    shell(ctx, -0.1, 0, 0.53, 0.48, "#ffb855", "#ed361c", "#74110c", pressure);
    line(ctx, "#631b18", 0.026, -0.62, 0, 0.43, 0);
    for (const side of [-1, 1]) {
      ellipse(ctx, -0.37, side * 0.23, 0.105, 0.095, "#211e1b");
      ellipse(ctx, 0.10, side * 0.28, 0.115, 0.10, "#211e1b");
      ellipse(ctx, -0.14, side * 0.27, 0.043, 0.038, "#211e1b");
      ellipse(ctx, -0.16, side * 0.43, 0.105, 0.040, "#211e1b");

    }
    ellipse(ctx, -0.02, 0, 0.075, 0.105, "#211e1b");
    // Soft dome reflection follows the shell curvature instead of opaque white patches.
    ctx.save(); ctx.beginPath(); ctx.ellipse(-0.1, 0, 0.53, 0.48, 0, 0, Math.PI * 2); ctx.clip();
    const sheen = ctx.createRadialGradient(0.06, -0.20, 0, 0.04, -0.19, 0.30);
    sheen.addColorStop(0, "#fffcebc9"); sheen.addColorStop(0.35, "#fff1cc66"); sheen.addColorStop(1, "#fff1cc00");
    ellipse(ctx, 0.04, -0.19, 0.30, 0.22, sheen, -0.2);
    ctx.restore();
    // Broad black pronotum and ivory shoulder patches, not isolated eye-like dots.
    ellipse(ctx, 0.51, 0, 0.10, 0.14, "#26352b");
    shell(ctx, 0.37, 0, 0.16, 0.33, "#838c81", "#303b33", "#111c16", pressure);
    ellipse(ctx, 0.42, -0.22, 0.08, 0.095, "#e3e9dc", -0.25);
    ellipse(ctx, 0.42, 0.22, 0.08, 0.095, "#e3e9dc", 0.25);

    ctx.restore();
  },
});
