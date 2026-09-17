import type { Viewport } from "./types";

function hash(x: number, y = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
const wrap = (value: number, span: number) => ((value % span) + span) % span;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Periodic value noise: the texture repeats without a visible tile boundary. */
function noise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = smooth(x - ix);
  const sy = smooth(y - iy);
  const a = hash(wrap(ix, period) + seed, wrap(iy, period));
  const b = hash(wrap(ix + 1, period) + seed, wrap(iy, period));
  const c = hash(wrap(ix, period) + seed, wrap(iy + 1, period));
  const d = hash(wrap(ix + 1, period) + seed, wrap(iy + 1, period));
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function mistDensity(u: number, v: number, seed: number): number {
  const warpX = noise(u * 4, v * 4, 4, seed + 41) - 0.5;
  const warpY = noise(u * 4, v * 4, 4, seed + 83) - 0.5;
  let value = 0;
  let weight = 0.57;
  for (const period of [4, 8, 16, 32]) {
    value += noise(u * period + warpX, v * period + warpY, period, seed) * weight;
    weight *= 0.5;
  }
  return smooth(Math.min(1, Math.max(0, (value - 0.16) / 0.72)));
}

/** Shared slow gust envelope for the dust veil, grit and wind audio. */
export function sandGust(time: number): number {
  return 0.66 + 0.22 * Math.sin(time * 0.37) + 0.12 * Math.sin(time * 0.113 + 1.4);
}

/** Integral of gust speed; changing gusts never teleport particles. */
export function sandTravel(time: number): number {
  return 0.66 * time + 0.22 / 0.37 * (1 - Math.cos(time * 0.37))
    + 0.12 / 0.113 * (Math.cos(1.4) - Math.cos(time * 0.113 + 1.4));
}

const textures = new Map<string, HTMLCanvasElement>();
function texture(sand: boolean, layer: number): HTMLCanvasElement {
  const key = `${sand}:${layer}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(192, 192);
  const color = sand ? [176, 148, 108] : [218, 225, 227];
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 192; x++) {
      const i = (y * 192 + x) * 4;
      pixels.data[i] = color[0];
      pixels.data[i + 1] = color[1];
      pixels.data[i + 2] = color[2];
      pixels.data[i + 3] = Math.round(mistDensity(x / 192, y / 192, 17 + layer * 59) * 210);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  textures.set(key, canvas);
  return canvas;
}

/** Cached soft turbulence, composited at different scales and drift speeds. */
export function drawAtmosphere(
  ctx: CanvasRenderingContext2D, viewport: Viewport, time: number,
  sand: boolean, wind: number, density = 1,
): void {
  const { width: w, height: h } = viewport;
  if (w <= 0 || h <= 0) return;
  const direction = wind < 0 ? -1 : 1;
  const strength = 0.65 + Math.min(1, Math.abs(wind)) * 0.6;
  const gust = sandGust(time);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const veil = ctx.createLinearGradient(0, 0, 0, h);
  const color = sand ? "165,137,99" : "214,223,226";
  veil.addColorStop(0, `rgba(${color},${sand ? 0.035 : 0.045})`);
  veil.addColorStop(1, `rgba(${color},${sand ? 0.12 : 0.13})`);
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 3; layer++) {
    const tw = (sand ? 1100 : 900) + layer * 230;
    const th = (sand ? 380 : 620) + layer * 120;
    const travel = sand ? sandTravel(time) * (42 + layer * 24) : time * (3 + layer * 2);
    const dx = wrap(direction * travel * strength + layer * 311, tw);
    const dy = wrap(Math.sin(time * 0.035 + layer) * 18 + layer * 193, th);
    ctx.globalAlpha = Math.min(0.38, (sand ? 0.17 + gust * 0.09 : 0.23) * density);
    const image = texture(sand, layer);
    for (let y = dy - th; y < h; y += th) {
      for (let x = dx - tw; x < w; x += tw) ctx.drawImage(image, x, y, tw, th);
    }
  }
  if (sand) {
    const count = Math.min(520, Math.round(w * h / 4300 * density));
    const travel = sandTravel(time) * strength;
    for (let i = 0; i < count; i++) {
      const seed = i * 13.71 + 7;
      const depth = hash(seed);
      const speed = 65 + depth * depth * 320;
      const x = wrap(hash(seed + 1) * (w + 32) + direction * travel * speed, w + 32) - 16;
      const y = wrap(hash(seed + 2) * (h + 32) + time * (2 + depth * 5)
        + Math.sin(time * (0.6 + depth) + seed) * (5 + depth * 12), h + 32) - 16;
      const size = 0.45 + depth * 0.85;
      ctx.globalAlpha = (0.1 + depth * 0.24) * (0.65 + gust * 0.35);
      ctx.fillStyle = i % 3 === 0 ? "#d0b78b" : "#8c744f";
      // Tiny horizontal traces only in the foreground; never rain-length lines.
      ctx.fillRect(x, y, size + depth * depth * gust * 2.5, size);
    }
  }
  ctx.restore();
}
