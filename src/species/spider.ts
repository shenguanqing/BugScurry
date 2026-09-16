import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, softHighlight } from "./drawing";

// Root, raised knee, ankle and toe. All eight legs attach to the
// cephalothorax; the abdomen has no legs. Each pair has its own silhouette.
const LEG_POSES = [
  [0.22, 0.10, 0.38, 0.20, 0.70, 0.23, 0.88, 0.22],
  [0.16, 0.14, 0.28, 0.36, 0.50, 0.48, 0.71, 0.55],
  [0.06, 0.14, -0.06, 0.39, -0.20, 0.53, -0.41, 0.66],
  [-0.02, 0.11, -0.18, 0.31, -0.44, 0.41, -0.77, 0.43],
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
      // Curved, tapering segments reproduce the raised, hooked emoji silhouette.
      // A dark core and a single thin rim keep the leg solid on either wallpaper.
      ctx.strokeStyle = "#a6aaa766"; ctx.lineWidth = 0.075;
      ctx.beginPath(); ctx.moveTo(rx, side * ry);
      ctx.quadraticCurveTo((rx + kneeX) * 0.5, side * (ry + ky) * 0.5, kneeX, side * ky);
      ctx.stroke();
      ctx.strokeStyle = "#202424"; ctx.lineWidth = 0.061; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kneeX, side * ky);
      ctx.quadraticCurveTo((kneeX + ankleX) * 0.5, side * (ky + ay) * 0.5, ankleX, side * ay);
      ctx.strokeStyle = "#92989466"; ctx.lineWidth = 0.047; ctx.stroke();
      ctx.strokeStyle = "#262b2b"; ctx.lineWidth = 0.034; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ankleX, side * ay);
      ctx.quadraticCurveTo((ankleX + tx + stride) * 0.5, side * (ay + ty) * 0.5, tx + stride, side * ty);
      ctx.strokeStyle = "#454b49"; ctx.lineWidth = 0.018; ctx.stroke();
      // Sparse short setae follow the outer leg rather than forming spikes.
      for (let j = 1; j <= 3; j++) {
        const t = j / 4;
        const x = kneeX + (ankleX - kneeX) * t;
        const y = side * (ky + (ay - ky) * t);
        line(ctx, "#776c5d44", 0.006, x, y, x - 0.025, y + side * 0.035);
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
    shell(ctx, -0.30, 0, 0.29, 0.23, "#9b9f9d", "#282c2b", "#101313", pressure);
    softHighlight(ctx, -0.23, -0.085, 0.18, 0.12, 0.48 * (1 - pressure));
    shell(ctx, 0.14, 0, 0.18, 0.13, "#92938b", "#343832", "#121612", pressure);
    // Short pedipalps sit beside the mouth, never resembling antennae.
    for (const side of [-1, 1]) {
      line(ctx, "#393229", 0.038, 0.28, side * 0.10, 0.34, side * 0.135, 0.39, side * 0.10);
      ellipse(ctx, 0.34, side * 0.047, 0.05, 0.033, "#24211c", side * 0.2);
      for (let i = 0; i < 4; i++) {
        const x = 0.34 - (i % 2) * 0.055;
        const y = side * (0.04 + Math.floor(i / 2) * 0.06);
        ellipse(ctx, x, y, 0.012, 0.012, "#100f0d");
        ellipse(ctx, x + 0.004, y - 0.005, 0.004, 0.004, "#b8ae9666");
      }
    }
    ctx.restore();
  },
});
