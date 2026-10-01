import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, softHighlight } from "./drawing";

registerSpecies({
  id: "worm",
  label: "蚯蚓",
  emoji: "🪱",
  traits: {
    favoriteFood: "fruit",
    eatStyle: "munch",
    activity: "diurnal",
    bodyScale: 1,
    speedMul: 0.45,
    edgeAffinity: 0.75,
    tint: "#e87070",
    stainColor: "#b04850",
    fluidColor: "#f0a0a0c4",
    fluidHighlight: "#ffd0c8",
    fluidShadow: "#a0505099",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 1.05;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s * 0.92);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Longitudinal peristalsis: short, thick sections travel toward the tail,
    // followed by long, thin sections. A gentle lateral wave travels head to tail.
    const count = 56;
    const motion = 1 - pressure;
    for (const surface of [false, true]) {
      for (let i = count - 1; i >= 0; i--) {
        const t = i / (count - 1);
        const wave = phase - t * Math.PI * 2;
        const stretch = Math.cos(wave) * motion;
        const x = 0.92 - t * 1.84 + Math.sin(wave) * 0.045 * motion;
        // Keep the head steady and let the tail follow a broad, moving S curve.
        const envelope = 0.55 + t * 0.45;
        const amplitude = 0.18 * motion;
        const y = envelope * Math.sin(wave) * amplitude;
        const dx = -1.84 - Math.cos(wave) * Math.PI * 2 * 0.045 * motion;
        const dy = (0.45 * Math.sin(wave)
          - envelope * Math.PI * 2 * Math.cos(wave)) * amplitude;
        const tangent = Math.atan2(-dy, -dx);
        const taper = Math.min(1, 0.78 + Math.sin(Math.PI * t) * 0.45);
        const radius = 0.135 * taper * (1 - stretch * 0.16) * (1 - pressure * 0.3);
        const saddle = Math.exp(-Math.pow((t - 0.25) / 0.065, 4));
        ctx.save(); ctx.translate(x, y); ctx.rotate(tangent);
        const width = radius * (1 + saddle * 0.10);
        if (!surface) {
          // Apple 🪱: vivid coral-pink flesh, not dusty brown.
          const flesh = ctx.createLinearGradient(0, -width, 0, width);
          flesh.addColorStop(0, "#ffaaa0");
          flesh.addColorStop(0.22, "#f88880");
          flesh.addColorStop(0.6, saddle > 0.5 ? "#f07870" : "#e0585c");
          flesh.addColorStop(1, "#983840");
          ellipse(ctx, 0, 0, 0.065, width, flesh);
        } else {
          if (i % 2 === 0 && i > 1 && i < count - 2) {
            ctx.beginPath(); ctx.ellipse(0, 0, 0.018, width * 0.94, 0, -Math.PI / 2, Math.PI / 2);
            ctx.strokeStyle = "#a048506e"; ctx.lineWidth = 0.011; ctx.stroke();
          }
          softHighlight(ctx, 0.01, -width * 0.40, 0.034, width * 0.28, 0.55 * (1 - pressure));
        }
        ctx.restore();
      }
    }
    ctx.restore();
  },
});
