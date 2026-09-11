import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
  autostart: false,
  monitorMode: "primary",
  species: "random",
  theme: "auto",
  locale: "auto",
};

export const LIMITS = {
  countMin: 1,
  countMax: 50,
  sizeMin: 0.6,
  sizeMax: 1.8,
  speedMin: 0.4,
  speedMax: 2.2,
  randomnessMin: 0,
  randomnessMax: 1,
} as const;

/** Base crawl speed in CSS pixels per second. */
export const BASE_SPEED = 70;

/** Hit radius multiplier relative to drawn body size. */
export const HIT_RADIUS_SCALE = 1.3;

export const SQUISH_DURATION = 0.28;
export const DEATH_FADE_DURATION = 1.05;
export const STAIN_LIFE = 3.2;
export const EDGE_MARGIN = 20;
export const MAX_DT = 0.05;
export const MAX_PARTICLES = 40;
export const MAX_STAINS = 14;
export const STUCK_TIMEOUT = 0.35;
