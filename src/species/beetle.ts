import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line } from "./drawing";

/**
 * Copy of the uploaded Apple 🪲 reference (top-down, head +X).
 * Structure, gold layout, leg bends and dark pronotum flanks follow
 * the reference image only — no redesign.
 */
registerSpecies({
  id: "beetle",
  label: "甲虫",
  emoji: "🪲",
  traits: {
    favoriteFood: "cookie",
    eatStyle: "munch",
    activity: "diurnal",
    bodyScale: 1,
    speedMul: 0.8,
    edgeAffinity: 0.5,
    tint: "#84cc16",
    stainColor: "#4d7c0f",
    fluidColor: "#d4e068c4",
    fluidHighlight: "#f4f0a0",
    fluidShadow: "#5a7a2099",
  },
  draw(ctx, bug: Bug, alpha: number) {
    const s = bug.size * 1.18;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    const k = 1 - pressure * 0.7;

    ctx.save();
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    /** Reference legs: green rods, dark contour, one knee, short toe. */
    const leg = (
      rx: number,
      ry: number,
      kx: number,
      ky: number,
      tx: number,
      ty: number,
      anim: number,
    ): void => {
      const reach = 1 - pressure * 0.28;
      const kneeX = kx + anim * 0.4, kneeY = ky * reach;
      const footX = tx + anim, footY = ty * reach;
      const sx = Math.sign(tx) || 1;
      const sy = Math.sign(ty) || 1;
      line(ctx, "#183408", 0.062, rx, ry, kneeX, kneeY, footX, footY);
      line(ctx, "#4a8c14", 0.040, rx, ry, kneeX, kneeY);
      line(ctx, "#3a740f", 0.030, kneeX, kneeY, footX, footY);
      line(ctx, "#7ec01c", 0.018, rx, ry * 0.9, kneeX, kneeY * 0.95);
      line(ctx, "#3a740f", 0.016, footX, footY, footX + sx * 0.038, footY + sy * 0.022);
      line(ctx, "#3a740f", 0.013, footX, footY, footX + sx * 0.028, footY - sy * 0.008);
    };

    // Leg roots / knees / feet follow the reference silhouette (head +X).
    for (const side of [-1, 1]) {
      const aF = Math.sin(phase + (side > 0 ? Math.PI : 0)) * 0.018 * k;
      const aM = Math.sin(phase + Math.PI + (side > 0 ? Math.PI : 0)) * 0.018 * k;
      const aH = Math.sin(phase + 0.5 * Math.PI + (side > 0 ? Math.PI : 0)) * 0.018 * k;
      // Fore — out and toward the head
      leg(0.26, side * 0.20, 0.42, side * 0.36, 0.52, side * 0.48, aF * side);
      // Mid — widest, nearly side-on
      leg(0.02, side * 0.34, 0.04, side * 0.52, -0.04, side * 0.64, aM * side);
      // Hind — out and toward the rear
      leg(-0.28, side * 0.32, -0.44, side * 0.46, -0.56, side * 0.52, aH * side);
    }

    // Antennae: short, slightly bent, green — as in the reference.
    for (const side of [-1, 1]) {
      const sway = Math.sin(phase * 0.35 + side) * 0.01 * k;
      const x0 = 0.50, y0 = side * 0.05;
      const x1 = 0.58, y1 = side * 0.14 + sway;
      const x2 = 0.64, y2 = side * 0.24 + sway;
      line(ctx, "#183408", 0.028, x0, y0, x1, y1, x2, y2);
      line(ctx, "#68b016", 0.018, x0, y0, x1, y1, x2, y2);
      ellipse(ctx, x2, y2, 0.028, 0.022, "#7ec01c");
    }

    /* ── Elytra: oval slightly wider than long — not a perfect circle ── */
    const ecx = -0.08, ecy = 0, erx = 0.40, ery = 0.48;

    // Dark contact under the shell
    if (pressure < 0.55) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ecx + 0.015, ecy + 0.03, erx * 0.97, ery * 0.97, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16, 32, 6, ${0.16 * k})`;
      ctx.fill();
      ctx.restore();
    }

    // Base: bright mid-green body, darkening to the rim (reference falloff)
    const base = ctx.createRadialGradient(ecx + 0.04, ecy - 0.06, 0.05, ecx, ecy, ery * 0.92);
    base.addColorStop(0, pressure === 0 ? "#b8dc30" : "#94a840");
    base.addColorStop(0.35, pressure === 0 ? "#7ec818" : "#608c24");
    base.addColorStop(0.62, pressure === 0 ? "#4ea010" : "#3e7818");
    base.addColorStop(0.84, pressure === 0 ? "#2e640c" : "#264c14");
    base.addColorStop(1, pressure === 0 ? "#1a3e08" : "#162c0c");
    ctx.beginPath();
    ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
    ctx.clip();

    // Reference gold: broad upper-left / upper-right regions (emoji scale),
    // not small circular spots. Soft wash connects them along the front.
    const wash = ctx.createRadialGradient(ecx + 0.06, ecy - 0.04, 0.06, ecx + 0.06, ecy - 0.02, 0.36);
    wash.addColorStop(0, `rgba(240, 230, 40, ${0.70 * k})`);
    wash.addColorStop(0.40, `rgba(210, 210, 28, ${0.40 * k})`);
    wash.addColorStop(1, "rgba(150, 170, 16, 0)");
    ellipse(ctx, ecx + 0.06, ecy - 0.02, 0.32, 0.30, wash);

    for (const side of [-1, 1]) {
      // Large elongated lobes on the head-facing half — emoji gold mass.
      const gx = ecx + 0.04, gy = side * 0.18;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(0.26, 0.22);
      const g = ctx.createRadialGradient(0, -side * 0.08, 0.04, 0, 0, 1);
      g.addColorStop(0, `rgba(255, 248, 60, ${0.98 * k})`);
      g.addColorStop(0.28, `rgba(240, 232, 36, ${0.88 * k})`);
      g.addColorStop(0.55, `rgba(200, 200, 22, ${0.50 * k})`);
      g.addColorStop(0.80, `rgba(140, 170, 16, ${0.18 * k})`);
      g.addColorStop(1, "rgba(110, 140, 14, 0)");
      ellipse(ctx, 0, 0, 1, 1, g);
      ctx.restore();
    }

    // Soft top sheen along the head-facing curve
    const sheen = ctx.createLinearGradient(ecx + 0.22, -ery, ecx - 0.08, 0.08);
    sheen.addColorStop(0, `rgba(255,255,160,${0.20 * k})`);
    sheen.addColorStop(0.5, "rgba(255,255,140,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(ecx - erx, ecy - ery, erx * 2, ery * 1.05);

    // Bottom of elytra in the reference stays green but sinks darker
    const rear = ctx.createLinearGradient(0, 0.10, 0, ery);
    rear.addColorStop(0, "rgba(14, 32, 6, 0)");
    rear.addColorStop(0.5, `rgba(14, 32, 6,${0.16 * k})`);
    rear.addColorStop(1, `rgba(10, 24, 4,${0.38 * k})`);
    ctx.fillStyle = rear;
    ctx.fillRect(ecx - erx, 0.08, erx * 2, ery);
    ctx.restore();

    // Rim
    ctx.strokeStyle = `rgba(18, 40, 6, ${0.90 * k})`;
    ctx.lineWidth = 0.034;
    ctx.beginPath();
    ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Center suture (clear dark line in the reference)
    if (pressure < 0.45) {
      line(ctx, `rgba(16, 36, 6, ${0.88 * k})`, 0.024, ecx + erx * 0.98, 0, ecx - erx * 0.98, 0);
    }

    /* ── Pronotum: gold center, very dark flanks (as in reference) ── */
    const px = 0.32, py = 0, prx = 0.20, pry = 0.28;
    if (pressure < 0.5) {
      const ao = ctx.createRadialGradient(px - 0.02, 0, 0.06, px - 0.02, 0, 0.30);
      ao.addColorStop(0, `rgba(10, 24, 4, ${0.26 * k})`);
      ao.addColorStop(1, "rgba(10,24,4,0)");
      ellipse(ctx, px - 0.02, 0, 0.28, 0.30, ao);
    }

    const pro = ctx.createRadialGradient(px, py - 0.06, 0.02, px, py, 0.22);
    pro.addColorStop(0, pressure === 0 ? "#e8dc30" : "#b8b048");
    pro.addColorStop(0.22, pressure === 0 ? "#b8c820" : "#8c9434");
    pro.addColorStop(0.48, pressure === 0 ? "#4e8c12" : "#40681c");
    // Dark flanks — emoji pronotum edges are near-black green
    pro.addColorStop(0.72, pressure === 0 ? "#1e4008" : "#1a300c");
    pro.addColorStop(1, pressure === 0 ? "#0e2404" : "#0c1a06");
    ctx.beginPath();
    ctx.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
    ctx.fillStyle = pro;
    ctx.fill();
    ctx.strokeStyle = `rgba(12, 28, 4, ${0.92 * k})`;
    ctx.lineWidth = 0.028;
    ctx.stroke();

    // Gold crown on the head-facing half only (not a full bright ball)
    const crown = ctx.createLinearGradient(px + 0.06, py - pry, px - 0.04, py + 0.06);
    crown.addColorStop(0, `rgba(245, 232, 45, ${0.78 * k})`);
    crown.addColorStop(0.45, `rgba(200, 200, 24, ${0.28 * k})`);
    crown.addColorStop(1, "rgba(120, 140, 14, 0)");
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = crown;
    ctx.fillRect(px - prx, py - pry, prx * 2, pry * 2);
    ctx.restore();

    /* ── Head ── */
    const hx = 0.52, hy = 0;
    if (pressure < 0.5) {
      const hao = ctx.createRadialGradient(hx - 0.03, hy, 0.02, hx - 0.03, hy, 0.11);
      hao.addColorStop(0, `rgba(10,24,4,${0.22 * k})`);
      hao.addColorStop(1, "rgba(10,24,4,0)");
      ellipse(ctx, hx - 0.03, hy, 0.11, 0.11, hao);
    }
    const head = ctx.createRadialGradient(hx, hy - 0.02, 0.01, hx, hy, 0.11);
    head.addColorStop(0, pressure === 0 ? "#e0d428" : "#aca448");
    head.addColorStop(0.42, "#78b818");
    head.addColorStop(0.8, "#2e5c0a");
    head.addColorStop(1, "#142c06");
    ellipse(ctx, hx, hy, 0.10, 0.12, head);
    if (pressure < 0.5) {
      for (const side of [-1, 1]) {
        ellipse(ctx, hx + 0.02, side * 0.075, 0.028, 0.032, "#121a0a");
        ellipse(ctx, hx + 0.03, side * 0.065, 0.009, 0.008, `rgba(190,210,70,${0.35 * k})`);
      }
    }

    ctx.restore();
  },
});
