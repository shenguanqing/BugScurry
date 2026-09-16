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
          ctx.bezierCurveTo(0.42, 0.25, 0.88, 0.68, 0.70, 0.96);
          ctx.bezierCurveTo(0.60, 1.05, 0.52, 0.91, 0.43, 0.88);
          ctx.bezierCurveTo(0.36, 0.89, 0.33, 0.85, 0.30, 0.82);
          ctx.bezierCurveTo(0.22, 0.85, 0.20, 0.78, 0.14, 0.79);
          ctx.bezierCurveTo(0.03, 0.79, -0.04, 0.65, -0.13, 0.61);
          ctx.bezierCurveTo(-0.06, 0.38, 0.03, 0.15, 0.07, 0.04);
        } else {
          ctx.bezierCurveTo(-0.10, 0.26, -0.04, 0.63, -0.12, 0.77);
          ctx.bezierCurveTo(-0.18, 0.83, -0.23, 0.74, -0.29, 0.80);
          ctx.bezierCurveTo(-0.35, 0.85, -0.37, 0.72, -0.43, 0.76);
          ctx.bezierCurveTo(-0.51, 0.78, -0.54, 0.65, -0.59, 0.69);
          ctx.bezierCurveTo(-0.66, 0.69, -0.70, 0.52, -0.77, 0.43);
          ctx.bezierCurveTo(-0.83, 0.26, -0.31, 0.10, 0.07, 0.04);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, 0.96);
        g.addColorStop(0, "#143b76"); g.addColorStop(0.38, "#128fdc");
        g.addColorStop(0.74, "#65d6ff"); g.addColorStop(1, "#2a6db9");
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#15202b"; ctx.lineWidth = 0.045; ctx.stroke();
        ctx.save(); ctx.clip();
        for (let i = 0; i < 4; i++) {
          const x = fore ? 0.64 - i * 0.16 : -0.29 - i * 0.077;
          const y = fore ? 0.92 - i * 0.055 : 0.73 - i * 0.038;
          line(ctx, "#175d8e66", 0.008, 0.06, 0.06, x * 0.55, y * 0.6, x, y);

        }
        // Place the small spots inside the scalloped margin, following each lobe.
        const spots = fore
          ? [[0.66, 0.92], [0.52, 0.87], [0.35, 0.82], [0.20, 0.76]]
          : [[-0.22, 0.74], [-0.37, 0.73], [-0.51, 0.65], [-0.66, 0.52]];
        for (const [x, y] of spots) {
          ellipse(ctx, x, y, 0.020, 0.016, fore ? "#effbffed" : "#ed9968dd");
        }
        ctx.restore();
      }
      ctx.restore();
    }
    // Six fine walking legs stay close to the thorax, under the dominant wings.
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const step = Math.sin(phase + i * Math.PI + side) * 0.02 * (1 - pressure);
        line(ctx, "#333a2dcc", 0.012, 0.20 - i * 0.09, side * 0.04,
          0.27 - i * 0.13 + step, side * 0.14, 0.21 - i * 0.13 + step, side * 0.19);
      }
    }
    shell(ctx, -0.22, 0, 0.31, 0.046, "#858071", "#343631", "#151b18", pressure);
    // Abdomen segment rings.
    for (let i = 0; i < 4; i++) {
      const x = -0.42 + i * 0.12;
      line(ctx, "#1c221d88", 0.018, x, -0.04, x, 0.04);
    }
    shell(ctx, 0.18, 0, 0.13, 0.049, "#a49d84", "#4f5141", "#232b22", pressure);
    ellipse(ctx, 0.37, 0, 0.044, 0.036, "#33382a");
    for (const side of [-1, 1]) {
      const sway = Math.sin(phase * 0.45 + side) * 0.025 * (1 - pressure);
      ctx.beginPath(); ctx.moveTo(0.39, side * 0.035);
      ctx.quadraticCurveTo(0.57, side * 0.15, 0.71, side * 0.18 + sway);
      ctx.strokeStyle = "#454635"; ctx.lineWidth = 0.018; ctx.stroke();
      ellipse(ctx, 0.71, side * 0.18 + sway, 0.019, 0.015, "#343b2c");
    }
    ctx.restore();
  },
});
