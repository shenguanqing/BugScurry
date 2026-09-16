import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell } from "./drawing";

// Root, raised knee, ankle and toe. All eight legs attach to the
// cephalothorax; the abdomen has no legs. Each pair has its own silhouette.
const LEG_POSES = [
  [0.22, 0.10, 0.54, 0.25, 0.93, 0.29, 1.12, 0.23],
  [0.16, 0.14, 0.42, 0.48, 0.73, 0.62, 0.95, 0.64],
  [0.06, 0.14, 0.02, 0.53, -0.23, 0.72, -0.40, 0.79],
  [-0.02, 0.11, -0.29, 0.36, -0.61, 0.43, -0.87, 0.40],
] as const;

function drawSpiderLegs(ctx: CanvasRenderingContext2D, phase: number, pressure: number): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < LEG_POSES.length; i++) {
    const [rx, ry, kx, ky, originalAx, originalAy, originalTx, originalTy] = LEG_POSES[i];
    const ax = kx + (originalAx - kx) * (1 - pressure * 0.8);
    const ay = originalAy * (1 - pressure * 0.52);
    const tx = kx + (originalTx - kx) * (1 - pressure * 0.9);
    const ty = originalTy * (1 - pressure * 0.7);
    for (const side of [-1, 1]) {
      const stride = Math.sin(phase + i * Math.PI + (side > 0 ? Math.PI : 0)) * 0.055;
      const kneeX = kx + stride * 0.35;
      const ankleX = ax + stride;
      // Thick femurs and raised joints taper into fine hooked feet.
      line(ctx, "#252321", 0.065, rx, side * ry, kneeX, side * ky);
      ellipse(ctx, kneeX, side * ky, 0.034, 0.034, "#302d29");
      line(ctx, "#302d29", 0.057, kneeX, side * ky, ankleX, side * ay);
      line(ctx, "#38332e", 0.029, ankleX, side * ay, tx + stride, side * ty);
      line(ctx, "#c1c5c499", 0.018, rx, side * (ry - 0.025), kneeX, side * (ky - 0.025), ankleX, side * (ay - 0.015));
      // Sparse short setae follow the outer leg rather than forming spikes.
      for (let j = 1; j <= 3; j++) {
        const t = j / 4;
        const x = kneeX + (ankleX - kneeX) * t;
        const y = side * (ky + (ay - ky) * t);
        line(ctx, "#776c5d99", 0.009, x, y, x - 0.025, y + side * 0.035);
      }
    }
  }
}

registerSpecies({
  id: "spider",
  label: "蜘蛛",
  emoji: "🕷",
  traits: {
    favoriteFood: "cookie",
    eatStyle: "wrap",
    activity: "nocturnal",
    bodyScale: 1,
    speedMul: 0.85,
    edgeAffinity: 0.45,
    tint: "#292524",
    stainColor: "#292524",
    fluidColor: "#d6ded177",
    fluidHighlight: "#f5fff2db",
    fluidShadow: "#87958866",
  },
  draw(ctx, bug: Bug, alpha: number) {
    // Calibrated by body mass, excluding legs, wings and antennae.
    const s = bug.size * 1.30;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    drawSpiderLegs(ctx, phase, pressure);
    // A full pear-shaped abdomen and a compact cephalothorax, joined narrowly.
    ellipse(ctx, -0.09, 0, 0.18, 0.10, "#292622");
    shell(ctx, -0.30, 0, 0.30, 0.245, "#9b9f9d", "#282c2b", "#101313", pressure);
    ellipse(ctx, -0.25, -0.115, 0.18, 0.055, "#eef4ed77", -0.25);
    shell(ctx, 0.14, 0, 0.20, 0.17, "#92938b", "#343832", "#121612", pressure);
    // Short pedipalps sit beside the mouth, never resembling antennae.
    for (const side of [-1, 1]) {
      line(ctx, "#393229", 0.052, 0.35, side * 0.14, 0.44, side * 0.19, 0.49, side * 0.14);
      ellipse(ctx, 0.43, side * 0.057, 0.065, 0.041, "#24211c", side * 0.2);
      for (let i = 0; i < 4; i++) {
        const x = 0.34 - (i % 2) * 0.055;
        const y = side * (0.04 + Math.floor(i / 2) * 0.06);
        ellipse(ctx, x, y, 0.019, 0.019, "#100f0d");
        ellipse(ctx, x + 0.004, y - 0.005, 0.006, 0.006, "#b8ae96");
      }
    }
    ctx.restore();
  },
});
