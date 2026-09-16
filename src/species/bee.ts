import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, softHighlight, glossyEye } from "./drawing";

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
    ctx.scale(bug.size * 1.06, bug.size * 1.18);
    ctx.rotate(-0.14);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Side profile: rounded striped abdomen, raised head and swept-back wings.
    for (const far of [true, false]) {
      for (let i = 0; i < 3; i++) {
        const x = 0.22 - i * 0.26;
        const step = Math.sin(phase + i * 2.1 + (far ? Math.PI : 0)) * 0.06 * (1 - pressure);
        line(ctx, far ? "#65542c" : "#332a18", 0.042, x, 0.13, x - 0.05 + step, 0.37,
          x + 0.04 + step, 0.45 - pressure * 0.12);
        ellipse(ctx, x - 0.05 + step, 0.34, 0.052, 0.075, far ? "#6d5a23" : "#3e3615", -0.5);
      }
    }
    ctx.beginPath(); ctx.moveTo(-0.60, 0.12); ctx.lineTo(-0.78, 0.52);
    ctx.lineTo(-0.47, 0.31); ctx.closePath(); ctx.fillStyle = "#453a17"; ctx.fill();
    shell(ctx, -0.25, 0.01, 0.43, 0.39, "#fff790", "#f0cd39", "#a5771b", pressure);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-0.25, 0.01, 0.43, 0.39, 0, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 2; i++) {
      const x = -0.53 + i * 0.35;
      ctx.beginPath(); ctx.moveTo(x, -0.40);
      ctx.bezierCurveTo(x - 0.13, -0.08, x - 0.07, 0.20, x + 0.04, 0.42);
      ctx.lineTo(x + 0.22, 0.42);
      ctx.bezierCurveTo(x + 0.06, 0.12, x + 0.02, -0.14, x + 0.18, -0.40);
      ctx.closePath();
      const band = ctx.createLinearGradient(0, -0.38, 0, 0.40);
      band.addColorStop(0, "#514b23"); band.addColorStop(0.3, "#242719"); band.addColorStop(1, "#0e140b");
      ctx.fillStyle = band; ctx.fill();
    }
    // Soft fringe along the stinger tip and a pollen-basket blush on the hind leg.
    ellipse(ctx, -0.68, 0.04, 0.08, 0.12, "#c9a43a55");
    softHighlight(ctx, -0.20, -0.20, 0.36, 0.19, 0.48 * (1 - pressure)); ctx.restore();
    shell(ctx, 0.20, -0.08, 0.22, 0.30, "#fff19c", "#d1ab37", "#7e6828", pressure);
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI * 2 / 20;
      line(ctx, "#dfc16e99", 0.01, 0.22 + Math.cos(a)*0.21, -0.06 + Math.sin(a)*0.25,
        0.22 + Math.cos(a)*0.255, -0.06 + Math.sin(a)*0.295);
    }
    // Two overlapping translucent wings rise above the back.
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.translate(0.06, -0.28);
      ctx.rotate(-0.30 + i * 0.13 + Math.sin(phase * 3) * 0.055 * (1 - pressure));
      const g = ctx.createLinearGradient(0, 0, -0.65, -0.46);
      g.addColorStop(0, "#f1edc688"); g.addColorStop(1, "#b9b5a1bf");
      ellipse(ctx, -0.34, -0.20, 0.47, 0.20, g, 0.47);
      line(ctx, "#aaa68d66", 0.01, 0, 0, -0.37, -0.22, -0.68, -0.34);
      // Cross-veins so the membrane reads as a wing, not a glass chip.
      line(ctx, "#b8b49955", 0.008, -0.18, -0.12, -0.32, -0.02);
      line(ctx, "#b8b49955", 0.008, -0.40, -0.24, -0.52, -0.14);
      line(ctx, "#b8b49955", 0.008, -0.55, -0.30, -0.62, -0.22);
      ctx.restore();
    }
    shell(ctx, 0.46, -0.12, 0.205, 0.265, "#dbc269", "#817023", "#36351b", pressure);
    glossyEye(ctx, 0.52, -0.14, 0.12, 0.18, pressure);
    for (const shift of [0, 0.10]) {
      const sway = Math.sin(phase * 0.5 + shift * 8) * 0.026 * (1 - pressure);
      ctx.beginPath(); ctx.moveTo(0.48 - shift, -0.30);
      ctx.bezierCurveTo(0.61 - shift, -0.60, 0.60 - shift, -0.65, 0.37 - shift + sway, -0.63);
      ctx.strokeStyle = "#6e623a"; ctx.lineWidth = 0.023; ctx.stroke();
    }
    ctx.restore();
  },
});
