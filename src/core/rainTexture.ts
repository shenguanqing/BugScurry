/** Offline-built textures: no per-drop nodes or synthesis in the animation loop. */
export type RainLayer = "bed" | "drops" | "spray";

export function createRainTexture(
  sampleRate: number,
  seconds: number,
  layer: RainLayer,
  random: () => number = Math.random,
): [Float32Array, Float32Array] {
  const length = Math.floor(sampleRate * seconds);
  const channels: [Float32Array, Float32Array] = [
    new Float32Array(length), new Float32Array(length),
  ];
  if (layer === "bed") {
    const overlap = Math.min(Math.floor(sampleRate * 0.2), length);
    for (const data of channels) {
      const raw = new Float32Array(length + overlap);
      let low = 0;
      let mid = 0;
      const lowPole = Math.exp(-2 * Math.PI * 350 / sampleRate);
      const midPole = Math.exp(-2 * Math.PI * 4200 / sampleRate);
      const phase = random() * Math.PI * 2;
      for (let i = 0; i < raw.length; i++) {
        const white = random() * 2 - 1;
        low = lowPole * low + (1 - lowPole) * white;
        mid = midPole * mid + (1 - midPole) * white;
        const u = i / length * Math.PI * 2;
        const swell = 0.8 + 0.12 * Math.sin(u + phase) + 0.08 * Math.sin(3 * u - phase);
        raw[i] = (low * 1.8 + mid * 0.55) * swell * 0.4;
      }
      data.set(raw.subarray(0, length));
      // Overlap the continuation AFTER the loop end onto its beginning. The
      // final sample now meets its actual successor, without a periodic dip.
      for (let i = 0; i < overlap; i++) {
        const blend = i / overlap;
        data[i] = raw[length + i] * (1 - blend) + raw[i] * blend;
      }
    }
    return channels;
  }

  const rate = layer === "drops" ? 14 : 115;
  let time = 0;
  while (true) {
    // Exponential arrival intervals avoid an audible rhythmic patter.
    time += -Math.log(Math.max(1e-7, 1 - random())) / rate;
    if (time >= seconds) break;
    const start = Math.floor(time * sampleRate);
    const duration = layer === "drops" ? 0.025 + random() * 0.075 : 0.008 + random() * 0.028;
    const count = Math.floor(sampleRate * duration);
    const amplitude = (layer === "drops" ? 0.45 : 0.22) * (0.3 + random() * 0.7);
    const pan = 0.15 + random() * 0.7;
    const left = Math.cos(pan * Math.PI / 2);
    const right = Math.sin(pan * Math.PI / 2);
    const pole = Math.exp(-2 * Math.PI * (700 + random() * 5500) / sampleRate);
    let body = 0;
    for (let j = 0; j < count; j++) {
      const u = j / count;
      const white = random() * 2 - 1;
      body = pole * body + (1 - pole) * white;
      const envelope = Math.min(1, j / (sampleRate * 0.0015)) * Math.exp(-6 * u) * (1 - u);
      const value = (body * 0.8 + white * 0.2) * envelope * amplitude;
      // Wrap tails, so drops crossing the seam are not cut short.
      const index = (start + j) % length;
      channels[0][index] += value * left;
      channels[1][index] += value * right;
    }
  }
  return channels;
}
