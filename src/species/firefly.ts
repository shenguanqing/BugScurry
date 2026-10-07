import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, softHighlight } from "./drawing";

/** Breathing lantern pulse — driven by walk phase + spawn seed so bugs desync. */
function glowPulse(bug: Bug): number {
  const t = bug.legPhase * Math.PI * 2 + bug.seed;
  return 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * 1.35));
}

let lanternSprite: HTMLCanvasElement | null = null;
const LANTERN_PX = 96;

/** Baked lantern halo; the pulse scales drawImage and multiplies alpha. */
function getLanternSprite(): HTMLCanvasElement {
  if (lanternSprite) return lanternSprite;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LANTERN_PX;
  const g = canvas.getContext("2d");
  if (g) {
    const half = LANTERN_PX / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, "rgba(255, 240, 150, 0.55)");
    grad.addColorStop(0.35, "rgba(250, 204, 80, 0.28)");
    grad.addColorStop(1, "rgba(250, 204, 80, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, LANTERN_PX, LANTERN_PX);
  }
  lanternSprite = canvas;
  return canvas;
}

function drawLantern(ctx: CanvasRenderingContext2D, pulse: number, pressure: number): void {
  const strength = pulse * (1 - pressure * 0.85);
  const r = 0.22 + strength * 0.08;
  ctx.save();
  // Multiply: draw() already scaled globalAlpha by the bug-wide fade.
  ctx.globalAlpha = ctx.globalAlpha * strength;
  ctx.drawImage(getLanternSprite(), -0.72 - r * 2.4, -r * 2.0, r * 4.8, r * 4.0);
  ctx.restore();
  ellipse(ctx, -0.72, 0, r * 0.72, r * 0.62, `rgba(255, 250, 200, ${0.85 * strength})`);
  ellipse(ctx, -0.70, 0, r * 0.32, r * 0.28, `rgba(255, 255, 240, ${Math.min(1, 0.95 * strength)})`);
}

registerSpecies({
  id: "firefly",
  label: "萤火虫",
  emoji: "🌟",
  traits: {
    favoriteFood: "sugar",
    eatStyle: "hover",
    activity: "nocturnal",
    bodyScale: 1,
    speedMul: 0.95,
    edgeAffinity: 0.2,
    tint: "#eab308",
    stainColor: "#a16207",
    fluidColor: "#e8d48ac4",
    fluidHighlight: "#fff3ad",
    fluidShadow: "#b8963c99",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 1.12;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    const pulse = glowPulse(bug);
    ctx.save();
    ctx.scale(s, s * 1.16);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const step = Math.sin(phase + i * Math.PI + side) * 0.04 * (1 - pressure);
        const root = 0.22 - i * 0.24;
        const knee = root + (i === 0 ? 0.08 : -0.10) + step;
        const foot = knee + (i === 0 ? 0.14 : -0.18);
        line(ctx, "#2a241c", 0.032, root, side * 0.14, knee, side * 0.34);
        line(ctx, "#3a3228", 0.020, knee, side * 0.34, foot, side * (0.48 - pressure * 0.16));
      }
    }
    // The light belongs to exposed terminal abdominal segments, not a detached dot.
    if (pressure < 0.85) drawLantern(ctx, pulse, pressure);
    shell(ctx, -0.64, 0, 0.21, 0.18, "#fffac2", "#dce56e", "#899442", pressure);
    for (const x of [-0.76, -0.65]) {
      ctx.beginPath(); ctx.moveTo(x, -0.14);
      ctx.quadraticCurveTo(x - 0.035, 0, x, 0.14);
      ctx.strokeStyle = "#717a3c88"; ctx.lineWidth = 0.013; ctx.stroke();
    }
    softHighlight(ctx, -0.69, -0.025, 0.17, 0.12, pulse * (1 - pressure));
    // Two leathery wing cases with amber margins and a crisp central suture.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(1, side);
      ctx.rotate(Math.sin(phase * 2.6) * 0.012 * (1 - pressure));
      ctx.beginPath(); ctx.moveTo(0.16, 0.01);
      ctx.bezierCurveTo(0.20, 0.24, -0.20, 0.26, -0.57, 0.15);
      ctx.quadraticCurveTo(-0.65, 0.11, -0.59, 0.025);
      ctx.closePath();
      const wing = ctx.createLinearGradient(0, 0, 0, 0.24);
      wing.addColorStop(0, "#272a22"); wing.addColorStop(0.38, "#464431");
      wing.addColorStop(0.72, "#393c2c"); wing.addColorStop(1, "#74613a");
      ctx.fillStyle = wing; ctx.fill(); ctx.strokeStyle = "#655031"; ctx.lineWidth = 0.018; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.09, 0.08);
      ctx.quadraticCurveTo(-0.22, 0.16, -0.53, 0.08);
      ctx.strokeStyle = "#c2a16622"; ctx.lineWidth = 0.012; ctx.stroke();
      ctx.restore();
    }
    // Classic firefly pronotum: warm red-orange over the head.
    shell(ctx, 0.22, 0, 0.18, 0.22, "#f5b28c", "#cc6244", "#702c24", pressure);
    ellipse(ctx, 0.23, 0, 0.12, 0.105, "#42342a");
    shell(ctx, 0.40, 0, 0.13, 0.12, "#8a7560", "#3a3028", "#1a1612", pressure);
    ellipse(ctx, 0.44, -0.10, 0.07, 0.08, "#1a1814");
    ellipse(ctx, 0.44, 0.10, 0.07, 0.08, "#1a1814");
    for (const side of [-1, 1]) {
      const sway = Math.sin(phase * 0.45 + side) * 0.02 * (1 - pressure);
      line(ctx, "#2c261c", 0.018, 0.48, side * 0.06, 0.62 + sway, side * 0.18);
    }
    ctx.restore();
  },
});
