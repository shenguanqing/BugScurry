/** Shared Canvas primitives in body-size units; the head points along +X. */
export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rotation = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

/** Flat oval contact shadow so the bug sits on the wallpaper instead of floating. */
export function contactShadow(ctx: CanvasRenderingContext2D, radius: number, alpha = 0.2): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, `rgba(20, 16, 12, ${alpha})`);
  g.addColorStop(0.55, `rgba(20, 16, 12, ${alpha * 0.42})`);
  g.addColorStop(1, "rgba(20, 16, 12, 0)");
  ctx.save();
  ctx.translate(0, radius * 0.12);
  ctx.scale(1, 0.52);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Soft specular glint on a hard shell; only for larger plates. */
export function glint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation = -0.45,
  strength = 0.22,
): void {
  ellipse(ctx, x, y, rx, ry, `rgba(255, 252, 245, ${strength})`, rotation);
}

/** A feathered reflection, without a hard-edged white decal. */
export function softHighlight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, strength = 0.4): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const light = ctx.createRadialGradient(-0.15, -0.2, 0, 0, 0, 1);
  light.addColorStop(0, `rgba(255, 248, 234, ${strength})`);
  light.addColorStop(0.4, `rgba(255, 248, 234, ${strength * 0.5})`);
  light.addColorStop(1, "rgba(255, 248, 234, 0)");
  ellipse(ctx, 0, 0, 1, 1, light);
  ctx.restore();
}

/** Convex dark eye with a warm rim and two restrained reflections. */
export function glossyEye(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, pressure: number): void {
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 0, x, y, ry);
  g.addColorStop(0, "#59615a"); g.addColorStop(0.35, "#182020"); g.addColorStop(1, "#060a0b");
  ellipse(ctx, x, y, rx, ry, g);
  ctx.strokeStyle = "#b5aa8955"; ctx.lineWidth = 0.013; ctx.stroke();
  softHighlight(ctx, x + rx * 0.15, y - ry * 0.48, rx * 0.55, ry * 0.28, 0.82 * (1 - pressure));
}

export function shell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, light: string, mid: string, dark: string, pressure = 0): void {
  const g = ctx.createRadialGradient(x - rx * 0.25, y - ry * 0.4, 0, x, y, rx * 1.1);
  // Blend the shell light continuously as its raised surface collapses.
  const lightRgb = Number.parseInt(light.slice(1), 16);
  const midRgb = Number.parseInt(mid.slice(1), 16);
  const channel = (shift: number) => Math.round(
    ((lightRgb >> shift) & 255) * (1 - pressure * 0.85)
    + ((midRgb >> shift) & 255) * pressure * 0.85,
  );
  g.addColorStop(0, pressure === 0 ? light : `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`);
  g.addColorStop(0.5 - pressure * 0.25, mid);
  g.addColorStop(1, dark);
  ellipse(ctx, x, y, rx, ry, g);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.025;
  ctx.stroke();
  // Tiny highlight crescent on hard plates (skipped while crushed).
  if (pressure < 0.2 && rx >= 0.16 && ry >= 0.12) {
    glint(ctx, x - rx * 0.32, y - ry * 0.38, rx * 0.2, ry * 0.11, -0.5, 0.2 * (1 - pressure));
  }
}

export function line(ctx: CanvasRenderingContext2D, color: string, width: number, ...points: number[]): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  // A restrained edge light keeps dark appendages readable on dark desktops.
  if (width >= 0.02) {
    ctx.strokeStyle = "#d4cbbc55";
    ctx.lineWidth = width + 0.018;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Alternating tripod gait, with tapered femur/tibia/tarsus segments. */
export function legs(ctx: CanvasRenderingContext2D, phase: number, pairs: number, reach: number, color: string, spines = false, pressure = 0): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < pairs; i++) {
    const along = 0.28 - i * 0.23;
    const fan = pairs === 4 ? 0.72 - i * 0.48 : 0.48 - i * 0.48;
    for (const side of [-1, 1]) {
      const step = Math.sin(phase + i * Math.PI + (side === 1 ? Math.PI : 0)) * 0.075;
      const kneeX = along + fan * 0.45 + step;
      const kneeY = side * reach * (0.63 + pressure * 0.1);
      const footX = along + (fan + step) * (1 - pressure * 0.5);
      const footY = side * reach * (1 - pressure * (0.35 + i * 0.06));
      line(ctx, color, 0.065, along, side * 0.1, kneeX, kneeY);
      line(ctx, color, 0.042, kneeX, kneeY, footX, footY);
      line(ctx, color, 0.022, footX, footY, footX - 0.08, footY + side * (0.08 - pressure * 0.18));
      line(ctx, "#c2a68966", 0.013, along, side * 0.13, kneeX, kneeY);
      line(ctx, "#c2a68955", 0.012, kneeX, kneeY, footX, footY);
      if (spines) {
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          const x = kneeX + (footX - kneeX) * t;
          const y = kneeY + (footY - kneeY) * t;
          line(ctx, color, 0.016, x, y, x + 0.07, y + side * 0.06);
        }
      }
    }
  }
}

export function antennae(ctx: CanvasRenderingContext2D, phase: number, start: number, length: number, spread: number, color: string, elbow = false): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.024;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const sway = Math.sin(phase * 0.5 + side) * 0.035;
    ctx.beginPath();
    ctx.moveTo(start, side * 0.075);
    if (elbow) {
      ctx.lineTo(start + length * 0.4, side * spread * 0.8);
      ctx.lineTo(start + length, side * spread * 0.65 + sway);
    } else {
      ctx.quadraticCurveTo(start + length * 0.45, side * spread * 0.4, start + length, side * spread + sway);
    }
    ctx.stroke();
  }
}
