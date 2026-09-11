import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
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
export const HIT_RADIUS_SCALE = 1.35;

export const SQUISH_DURATION = 0.35;
export const DEATH_FADE_DURATION = 1.1;
export const EDGE_MARGIN = 12;
export const MAX_DT = 0.05;
