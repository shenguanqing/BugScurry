import { squishPressure } from "../core/squish";
import type { Bug } from "../core/types";
import { registerSpecies } from "./registry";
import { ellipse, line, shell, softHighlight } from "./drawing";

registerSpecies({
  id: "cockroach",
  label: "蟑螂",
  emoji: "🪳",
  traits: {
    favoriteFood: "cookie",
    eatStyle: "scurry",
    activity: "nocturnal",
    bodyScale: 1,
    speedMul: 1,
    edgeAffinity: 0.55,
    tint: "#5c4030",
    stainColor: "#3b2a1a",
    fluidColor: "#c1b66dbd",
    fluidHighlight: "#f7edc6dc",
    fluidShadow: "#897d4299",
  },
  draw(ctx, bug: Bug, alpha: number) {
    // Calibrated by body mass, excluding legs, wings and antennae.
    const s = bug.size * 1.10;
    const phase = bug.legPhase * Math.PI * 2;
    const pressure = squishPressure(bug);
    ctx.save();
    ctx.scale(s, s * 0.91);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const step = Math.sin(phase + i * Math.PI + side) * 0.05 * (1 - pressure);
        const root = 0.25 - i * 0.32;
        const knee = root + (i === 0 ? 0.13 : -0.15) + step;
        const foot = knee + (i === 0 ? 0.20 : -0.27);
        const reach = (0.56 - pressure * 0.20) * side;
        line(ctx, "#915c43", 0.035, root, side * 0.18, knee, side * 0.38);
        line(ctx, "#a67552", 0.022, knee, side * 0.38, foot, reach);
        line(ctx, "#b08e62", 0.012, foot, reach, foot - 0.06, reach + side * 0.05);
        for (let j = 1; j < 5; j++) {
          const t = j / 5;
          const x = knee + (foot - knee) * t, y = side * 0.38 + (reach - side * 0.38) * t;
          line(ctx, "#9a6547", 0.009, x, y, x + 0.035, y + side * 0.035);
        }
      }
    }
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.49, side * 0.08);
      ctx.bezierCurveTo(1.14, side * 0.23, 1.02, side * 0.73, 0.04, side * (0.70 + Math.sin(phase * 0.4) * 0.025));
      ctx.strokeStyle = "#cfb3a080";
      ctx.lineWidth = 0.021;
      ctx.stroke();
      ctx.strokeStyle = "#875d50";
      ctx.lineWidth = 0.009;
      ctx.stroke();
    }
    line(ctx, "#654026", 0.03, -0.64, -0.12, -0.83, -0.2);
    line(ctx, "#654026", 0.03, -0.64, 0.12, -0.83, 0.2);
    shell(ctx, -0.19, 0, 0.65, 0.27, "#b4784e", "#57262c", "#271820", pressure);
    // Warm translucent wing tips and a longitudinal satin reflection.
    ellipse(ctx, -0.70, 0, 0.055, 0.085, "#d5a15c44");
    softHighlight(ctx, -0.02, -0.10, 0.40, 0.11, 0.27 * (1 - pressure));
    // Paired leathery forewings and fine longitudinal veins.
    for (const side of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        const y = side * i * 0.052;
        ctx.strokeStyle = "#c77c631c";
        ctx.lineWidth = 0.013;
        ctx.beginPath();
        ctx.moveTo(0.12, y * 0.5);
        ctx.quadraticCurveTo(-0.25, y, -0.62 + i * 0.035, y * 0.7);
        ctx.stroke();
      }
    }
    line(ctx, "#21151d", 0.02, 0.2, 0, -0.69, 0);
    // Pronotum with the classic pale twin spots behind the head.
    shell(ctx, 0.24, 0, 0.20, 0.22, "#d0a385", "#82564b", "#44292c", pressure);
    if (pressure < 0.35) {
      for (const side of [-1, 1]) {
        ellipse(ctx, 0.28, side * 0.09, 0.07, 0.055, "#e8c9a8cc", side * 0.35);
      }
    }
    shell(ctx, 0.43, 0, 0.12, 0.125, "#956337", "#53351e", "#2f2117", pressure);
    const shield = ctx.createRadialGradient(0.27, -0.04, 0, 0.24, 0, 0.19);
    shield.addColorStop(0, "#916448"); shield.addColorStop(0.55, "#51302e"); shield.addColorStop(1, "#ab774b");
    ellipse(ctx, 0.24, 0, 0.15, 0.16, shield);
    for (const side of [-1, 1]) ellipse(ctx, 0.22, side * 0.11, 0.049, 0.042, "#d8a75b99");
    ellipse(ctx, 0.48, -0.095, 0.052, 0.035, "#161611");
    ellipse(ctx, 0.48, 0.095, 0.052, 0.035, "#161611");
    ctx.restore();
  },
});
