import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

registerSpecies({
  id: "butterfly",
  label: "蝴蝶",
  emoji: "🦋",
  traits: {
    favoriteFood: "sugar",
    eatStyle: "probe",
    activity: "diurnal",
    bodyScale: 1,
    speedMul: 0.95,
    edgeAffinity: 0.15,
    tint: "#a855f7",
    stainColor: "#7e22ce",
    fluidColor: "#e9d5ffc4",
    fluidHighlight: "#fae8ffdf",
    fluidShadow: "#a78bfa99",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(bug.size, bug.size);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Mirrored fore- and hindwings share a hinge and a synchronized flap.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, side * (0.92 + Math.sin(phase * 2) * 0.08) * (1 - pressure * 0.25));
      for (const fore of [false, true]) {
        ctx.beginPath(); ctx.moveTo(0.07, 0.04);
        if (fore) {
          ctx.bezierCurveTo(0.42, 0.27, 0.91, 0.61, 0.83, 0.97);
          ctx.bezierCurveTo(0.69, 1.03, 0.42, 0.82, 0.16, 0.83);
          ctx.bezierCurveTo(0.06, 0.82, -0.06, 0.68, -0.12, 0.54);
          ctx.bezierCurveTo(-0.03, 0.29, 0.01, 0.15, 0.07, 0.04);
        } else {
          ctx.bezierCurveTo(-0.16, 0.32, -0.22, 0.77, -0.46, 0.79);
          ctx.bezierCurveTo(-0.58, 0.73, -0.63, 0.62, -0.72, 0.54);
          ctx.bezierCurveTo(-0.75, 0.30, -0.32, 0.11, 0.07, 0.04);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, 0.96);
        g.addColorStop(0, "#143b76"); g.addColorStop(0.38, "#168bc6");
        g.addColorStop(0.74, "#6edcfa"); g.addColorStop(1, "#2a6db9");
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#15202b"; ctx.lineWidth = 0.055; ctx.stroke();
        ctx.save(); ctx.clip();
        for (let i = 0; i < 6; i++) {
          const x = fore ? 0.76 - i * 0.15 : -0.29 - i * 0.077;
          const y = fore ? 0.92 - i * 0.055 : 0.73 - i * 0.038;
          line(ctx, "#17477599", 0.012, 0.06, 0.06, x * 0.55, y * 0.6, x, y);
          ellipse(ctx, x, y - 0.02, 0.023, 0.018, "#e7f6ffdd");
        }
        ctx.restore();
      }
      ctx.restore();
    }
    shell(ctx, -0.22, 0, 0.42, 0.062, "#858071", "#343631", "#151b18", pressure);
    shell(ctx, 0.18, 0, 0.15, 0.085, "#a49d84", "#4f5141", "#232b22", pressure);
    ellipse(ctx, 0.37, 0, 0.068, 0.065, "#33382a");
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0.39, side * 0.035);
      ctx.quadraticCurveTo(0.57, side * 0.15, 0.71, side * 0.18);
      ctx.strokeStyle = "#454635"; ctx.lineWidth = 0.018; ctx.stroke();
      ellipse(ctx, 0.71, side * 0.18, 0.032, 0.022, "#343b2c");
    }
    ctx.restore();
  },
});
