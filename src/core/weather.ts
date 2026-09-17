import type { DayPhase, RainKind, Settings } from "./types";

/** Local-clock day phase used to bias random species mixes. */
export function dayPhaseFromHour(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 18) return "day";
  if (h >= 18 && h < 21) return "dusk";
  return "night";
}

export function currentDayPhase(now: Date = new Date()): DayPhase {
  return dayPhaseFromHour(now.getHours());
}

/** How much a species is favored in a phase (1 = neutral). */
export function phaseActivityWeight(
  activity: "diurnal" | "nocturnal" | undefined,
  phase: DayPhase,
): number {
  if (!activity) return 1;
  if (phase === "night") return activity === "nocturnal" ? 2.1 : 0.4;
  if (phase === "dusk") return activity === "nocturnal" ? 1.35 : 0.85;
  if (phase === "dawn") return activity === "diurnal" ? 1.35 : 0.85;
  return activity === "diurnal" ? 1.9 : 0.45;
}

export interface RainProfile {
  /** Multiplier over the base streak field. */
  density: number;
  /** Extra length / motion-blur feel. */
  lengthMul: number;
  /** Global stroke brightness. */
  alphaMul: number;
  /** Cool wash over the desktop. */
  wash: number;
  /** Base wind lean magnitude (sign comes from settings.rainWind). */
  windMag: number;
  /** How hard the wind gusts. */
  windGust: number;
  speedMul: number;
  edgePull: number;
  pauseMul: number;
  coverPull: number;
  lightning: boolean;
  /** Which particle/renderer family to draw. */
  family: "rain" | "snow" | "fog" | "sand";
}

export const RAIN_PROFILES: Record<RainKind, RainProfile> = {
  light: {
    density: 0.38,
    lengthMul: 0.85,
    alphaMul: 0.72,
    wash: 0.012,
    windMag: 0.16,
    windGust: 0.04,
    speedMul: 0.94,
    edgePull: 1.6,
    pauseMul: 1.1,
    coverPull: 1.6,
    lightning: false,
    family: "rain",
  },
  moderate: {
    density: 0.7,
    lengthMul: 1,
    alphaMul: 1,
    wash: 0.028,
    windMag: 0.24,
    windGust: 0.07,
    speedMul: 0.86,
    edgePull: 2.8,
    pauseMul: 1.25,
    coverPull: 2.4,
    lightning: false,
    family: "rain",
  },
  heavy: {
    density: 1,
    lengthMul: 1.18,
    alphaMul: 1.15,
    wash: 0.045,
    windMag: 0.34,
    windGust: 0.1,
    speedMul: 0.78,
    edgePull: 3.8,
    pauseMul: 1.4,
    coverPull: 3.2,
    lightning: false,
    family: "rain",
  },
  downpour: {
    density: 1.4,
    lengthMul: 1.35,
    alphaMul: 1.28,
    wash: 0.07,
    windMag: 0.42,
    windGust: 0.14,
    speedMul: 0.7,
    edgePull: 4.8,
    pauseMul: 1.55,
    coverPull: 3.8,
    lightning: false,
    family: "rain",
  },
  thunder: {
    density: 1.25,
    lengthMul: 1.3,
    alphaMul: 1.22,
    wash: 0.085,
    windMag: 0.38,
    windGust: 0.18,
    speedMul: 0.72,
    edgePull: 4.6,
    pauseMul: 1.6,
    coverPull: 3.6,
    lightning: true,
    family: "rain",
  },
  snow: {
    density: 0.85,
    lengthMul: 1,
    alphaMul: 0.95,
    wash: 0.03,
    windMag: 0.2,
    windGust: 0.06,
    speedMul: 0.82,
    edgePull: 2.2,
    pauseMul: 1.35,
    coverPull: 2.0,
    lightning: false,
    family: "snow",
  },
  fog: {
    density: 1.1,
    lengthMul: 1,
    alphaMul: 1.15,
    wash: 0.22,
    windMag: 0.12,
    windGust: 0.03,
    speedMul: 0.9,
    edgePull: 1.2,
    pauseMul: 1.15,
    coverPull: 1.0,
    lightning: false,
    family: "fog",
  },
  sand: {
    density: 1.1,
    lengthMul: 1.25,
    alphaMul: 1.05,
    wash: 0.055,
    windMag: 0.55,
    windGust: 0.16,
    speedMul: 0.74,
    edgePull: 4.2,
    pauseMul: 1.45,
    coverPull: 3.4,
    lightning: false,
    family: "sand",
  },
};

export const RAIN_KIND_ORDER: readonly RainKind[] = [
  "light",
  "moderate",
  "heavy",
  "downpour",
  "thunder",
  "snow",
  "fog",
  "sand",
];

/** Weighted pick — mild showers are common; sand is rarer. */
export function pickRainKind(rng: () => number = Math.random): RainKind {
  const weights: Record<RainKind, number> = {
    light: 0.22,
    moderate: 0.26,
    heavy: 0.14,
    downpour: 0.08,
    thunder: 0.06,
    snow: 0.1,
    fog: 0.08,
    sand: 0.06,
  };
  let roll = rng();
  for (const kind of RAIN_KIND_ORDER) {
    roll -= weights[kind];
    if (roll <= 0) return kind;
  }
  return "moderate";
}

/** Fresh wind lean for a shower: mostly sideways, sometimes almost straight down. */
export function pickRainWind(rng: () => number = Math.random): number {
  // Avoid the exact center so every shower has a readable lean.
  const mag = 0.25 + rng() * 0.75;
  return rng() < 0.5 ? -mag : mag;
}

/** Movement response while raining. */
export function rainMotion(kind: RainKind): {
  speedMul: number;
  edgePull: number;
  pauseMul: number;
  coverPull: number;
} {
  const p = RAIN_PROFILES[kind];
  return {
    speedMul: p.speedMul,
    edgePull: p.edgePull,
    pauseMul: p.pauseMul,
    coverPull: p.coverPull,
  };
}

/** Shared wind lean for the current frame (settings wind + gusts + slow breath). */
export function rainWindAt(baseWind: number, profile: RainProfile, timeSec: number): number {
  const sign = baseWind < 0 ? -1 : 1;
  const mag = profile.windMag * (0.55 + Math.abs(baseWind) * 0.7);
  const gust =
    Math.sin(timeSec * 0.41) * profile.windGust +
    Math.sin(timeSec * 0.13 + 1.7) * profile.windGust * 0.55;
  return sign * mag + gust * sign;
}

/**
 * Double-strike lightning envelope in 0..1 for thunder storms.
 * Deterministic from wall time so flashes do not allocate or desync.
 */
export function lightningFlash(timeSec: number): number {
  const cycleLen = 6.2;
  const cycle = Math.floor(timeSec / cycleLen);
  const t = timeSec - cycle * cycleLen;
  // Not every window has a bolt — keep them surprising.
  if (fract(cycle * 3.71 + 0.17) > 0.58) return 0;
  const start = 0.55 + fract(cycle * 9.13 + 0.41) * (cycleLen - 1.4);
  const dt = t - start;
  if (dt < 0 || dt > 0.48) return 0;
  // Rise → hard peak → brief valley → second peak → decay.
  if (dt < 0.04) return (dt / 0.04) * 0.7;
  if (dt < 0.07) return 0.7 + ((dt - 0.04) / 0.03) * 0.3;
  if (dt < 0.12) return 1;
  if (dt < 0.17) return 0.22;
  if (dt < 0.24) return 0.9;
  return 0.9 * Math.max(0, 1 - (dt - 0.24) / 0.24);
}

function fract(n: number): number {
  return n - Math.floor(n);
}

/**
 * Depth-layered base field. Density / length / alpha scale per rain kind
 * without rewriting the seeds, so intensity stays frame-stable.
 */
export const RAIN_LAYERS = [
  { count: 42, speedMin: 250, speedMax: 390, lenMin: 6, lenMax: 12, alpha: 0.14, width: 0.65 },
  { count: 30, speedMin: 390, speedMax: 580, lenMin: 12, lenMax: 22, alpha: 0.24, width: 1.0 },
  { count: 18, speedMin: 580, speedMax: 920, lenMin: 22, lenMax: 42, alpha: 0.34, width: 1.35 },
] as const;

/** Dry gap before the next automatic shower (ms). */
export function nextDrySpanMs(rng: () => number = Math.random): number {
  return 40_000 + rng() * 160_000;
}

/** How long an automatic shower lasts (ms). Intense storms clear a bit sooner. */
export function nextWetSpanMs(
  rng: () => number = Math.random,
  kind: RainKind = "moderate",
): number {
  const base = 16_000 + rng() * 44_000;
  if (kind === "downpour" || kind === "thunder" || kind === "sand") return base * 0.78;
  if (kind === "light" || kind === "fog" || kind === "snow") return base * 1.15;
  return base;
}

export interface AutoRainClock {
  dueAtMs: number;
}

export function createAutoRainClock(
  nowMs: number,
  raining: boolean,
  rng: () => number = Math.random,
  kind: RainKind = "moderate",
): AutoRainClock {
  return {
    dueAtMs: nowMs + (raining ? nextWetSpanMs(rng, kind) : nextDrySpanMs(rng)),
  };
}

/** Advance the clock; returns the rain flag after any scheduled flip. */
export function tickAutoRain(
  clock: AutoRainClock,
  nowMs: number,
  raining: boolean,
  rng: () => number = Math.random,
): boolean {
  if (nowMs < clock.dueAtMs) return raining;
  const next = !raining;
  // Visual kind is rolled by the caller; this only arms a default wet/dry span.
  clock.dueAtMs = nowMs + (next ? nextWetSpanMs(rng) : nextDrySpanMs(rng));
  return next;
}

/** Re-arm after a manual toggle or settings change so auto does not fight the user. */
export function resetAutoRainClock(
  clock: AutoRainClock,
  nowMs: number,
  raining: boolean,
  rng: () => number = Math.random,
  kind: RainKind = "moderate",
): void {
  clock.dueAtMs = nowMs + (raining ? nextWetSpanMs(rng, kind) : nextDrySpanMs(rng));
}

/** Roll a complete new shower (strength + wind). */
export function rollShower(rng: () => number = Math.random): {
  kind: RainKind;
  wind: number;
} {
  return { kind: pickRainKind(rng), wind: pickRainWind(rng) };
}

/** Map a tray command id onto stop / start-with-kind. */
export function rainTrayAction(
  cmd: string,
): { mode: "off" } | { mode: "start"; kind: RainKind | "random" } | null {
  switch (cmd) {
    case "rain_off":
      return { mode: "off" };
    case "rain_light":
      return { mode: "start", kind: "light" };
    case "rain_moderate":
      return { mode: "start", kind: "moderate" };
    case "rain_heavy":
      return { mode: "start", kind: "heavy" };
    case "rain_downpour":
      return { mode: "start", kind: "downpour" };
    case "rain_thunder":
      return { mode: "start", kind: "thunder" };
    case "rain_snow":
      return { mode: "start", kind: "snow" };
    case "rain_fog":
      return { mode: "start", kind: "fog" };
    case "rain_sand":
      return { mode: "start", kind: "sand" };
    default:
      return null;
  }
}

/** Convenience for movement: null when dry. */
export function activeRainMotion(settings: Settings) {
  return settings.rain ? rainMotion(settings.rainKind) : null;
}
