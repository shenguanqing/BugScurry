import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, softHighlight } from "./drawing";

// Head points along +X. The wings spread outward from the thorax,
// leaving the narrow abdomen visible between them, like the settings emoji.
function drawWing(ctx: CanvasRenderingContext2D, side: number, phase: number, pressure: number): void {
  ctx.save();
  ctx.translate(0.12, side * 0.14);
  ctx.scale(1, side * 0.98);
  ctx.rotate(-0.10 + Math.sin(phase * 3) * 0.018 + pressure * (side > 0 ? 0.3 : -0.18));
  const membrane = ctx.createLinearGradient(0, 0, -0.9, 0.7);
  membrane.addColorStop(0, "#b57532c9");
  membrane.addColorStop(0.45, "#d5a562ae");
  membrane.addColorStop(1, "#edd39ac9");
  ctx.fillStyle = membrane;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-0.17, 0.10, -0.47, 0.45, -0.81, 0.65);
  ctx.bezierCurveTo(-1.13, 0.86, -1.18, 0.62, -1.02, 0.29);
  ctx.bezierCurveTo(-1.03, 0.13, -0.83, 0.13, -0.61, 0.12);
  ctx.bezierCurveTo(-0.37, 0.10, -0.13, 0.015, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#76502dc9";
  ctx.lineWidth = 0.018;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  // Long veins and cross-veins form the characteristic membrane cells.
  line(ctx, "#80552dcc", 0.017, 0, 0, -0.31, 0.19, -0.66, 0.44, -1.05, 0.67);
  line(ctx, "#80552dbb", 0.014, -0.07, 0.03, -0.43, 0.20, -0.78, 0.30, -1.10, 0.49);
  line(ctx, "#80552dbb", 0.014, -0.31, 0.19, -0.58, 0.36, -0.68, 0.56, -0.83, 0.68);
  line(ctx, "#80552daa", 0.012, -0.48, 0.23, -0.54, 0.35, -0.66, 0.44);
  line(ctx, "#80552daa", 0.012, -0.78, 0.30, -0.82, 0.43, -0.98, 0.40);
  line(ctx, "#80552daa", 0.012, -0.82, 0.43, -0.89, 0.57, -0.85, 0.70);
  ctx.restore();
  ctx.restore();
}

const LEG_POSES = [
  [0.20, 0.12, 0.31, 0.32, 0.63, 0.27],
  [0.05, 0.15, -0.15, 0.36, 0.12, 0.58],
  [-0.08, 0.13, -0.48, 0.34, -0.66, 0.56],
] as const;

registerSpecies({
  id: "fly",
  label: "苍蝇",
  emoji: "🪰",
  traits: {
    favoriteFood: "fruit",
    eatStyle: "sip",
    bodyScale: 1,
    speedMul: 1.4,
    edgeAffinity: 0.2,
    tint: "#3f3f46",
    stainColor: "#3f3f46",
    fluidColor: "#d8d9c777",
    fluidHighlight: "#ffffece0",
    fluidShadow: "#92978566",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    // Match the other species by body mass rather than wing span.
    ctx.scale(bug.size * 1.10, bug.size * 1.10);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < LEG_POSES.length; i++) {
      const [rx, ry, kx, ky, originalTx, originalTy] = LEG_POSES[i];
      const tx = kx + (originalTx - kx) * (1 - pressure * 0.7);
      const ty = originalTy * (1 - pressure * 0.48);
      for (const side of [-1, 1]) {
        const step = Math.sin(phase + i * Math.PI + side * Math.PI / 2) * 0.035;
        line(ctx, "#343028", 0.036, rx, side * ry, kx + step, side * ky);
        line(ctx, "#484031", 0.023, kx + step, side * ky, tx + step, side * ty);
        line(ctx, "#a2947666", 0.01, rx, side * ry, kx + step, side * ky);
      }
    }
    drawWing(ctx, -1, phase, pressure);
    drawWing(ctx, 1, phase, pressure);
    // Tapered, dark abdomen remains unobscured between the two wings.
    shell(ctx, -0.40, 0, 0.40, 0.17, "#6e6352", "#292821", "#11130f", pressure);
    for (let i = 0; i < 4; i++) {
      const x = -0.65 + i * 0.15;
      const halfWidth = i === 0 ? 0.11 : 0.145;
      line(ctx, "#15150f55", 0.013, x, -halfWidth, x - 0.015, 0, x, halfWidth);
    }
    line(ctx, "#c0a77522", 0.016, -0.22, -0.035, -0.67, -0.025);
    // Iridescent sheen on the abdomen base.
    softHighlight(ctx, -0.24, -0.045, 0.28, 0.07, 0.18 * (1 - pressure));
    shell(ctx, 0.12, 0, 0.245, 0.20, "#aea292", "#49473f", "#24251f", pressure);
    // Housefly thorax: fine longitudinal dark stripes, not a green shell.
    for (const y of [-0.105, -0.035, 0.035, 0.105]) {
      line(ctx, "#25282055", 0.011, -0.065, y * 0.8, 0.13, y, 0.30, y * 0.65);
    }
    // Deterministic fine thorax grain: visible at inspection scale, quiet at desktop size.
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 30);
      ellipse(ctx, 0.12 + Math.cos(a) * r * 0.19, Math.sin(a) * r * 0.155,
        0.008, 0.006, i % 2 ? "#ded4b83b" : "#161c1844");
    }
    shell(ctx, 0.41, 0, 0.17, 0.19, "#76786a", "#414638", "#20251d", pressure);
    for (const side of [-1, 1]) {
      shell(ctx, 0.44, side * 0.125, 0.12, 0.128, "#f0aca0", "#bb564c", "#502b28", pressure);
      ellipse(ctx, 0.49, side * 0.12 - 0.028, 0.052, 0.025, "#f8d7c85c", -0.4);
      // Compact antennae end just ahead of the eyes.
      line(ctx, "#302d24", 0.022, 0.55, side * 0.032, 0.62, side * 0.048 + Math.sin(phase * 0.4 + side) * 0.01 * (1 - pressure));
    }
    line(ctx, "#2b2d24", 0.038, 0.56, 0, 0.63, 0);
    ctx.restore();
  },
});
