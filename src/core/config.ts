import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
  repellent: true,
  autostart: false,
  monitorMode: "primary",
  species: "random",
  theme: "auto",
  locale: "auto",
  rain: false,
  rainKind: "moderate",
  rainWind: 0,
  autoRain: false,
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
/**
 * More forgiving hit radius while the cursor is already close to a bug —
 * chasing a fleeing bug should still land.
 */
export const HIT_RADIUS_CHASE = 2.15;

export const SQUISH_DURATION = 0.28;
export const DEATH_FADE_DURATION = 1.05;
export const STAIN_LIFE = 3.2;
export const EDGE_MARGIN = 20;
export const MAX_DT = 0.05;
export const MAX_PARTICLES = 40;
export const MAX_STAINS = 14;
export const STUCK_TIMEOUT = 0.35;
/** CSS px radius around the cursor that scares bugs away. */
export const REPELLENT_RADIUS = 72;
/**
 * Almost on top of the bug: it bolts at full speed with a less coordinated
 * heading (startle), instead of freezing in place.
 */
export const REPELLENT_PANIC_RADIUS = 28;
/** Flee speed multiplier at the edge of the radius. */
export const REPELLENT_SPEED_MIN = 1.45;
/** Flee speed multiplier when the cursor is very close. */
export const REPELLENT_SPEED_MAX = 2.25;

/** Food attraction: allow time for slow bugs to reach their snack. */
export const BAIT_LIFE = 20;
export const BAIT_ATTRACT_RADIUS = 320;
export const BAIT_NIBBLE_RADIUS = 16;
export const BAIT_PULL = 3.4;
export const MAX_BAITS = 3;
/** Post-meal glow after a favorite snack. */
export const SATISFIED_FAVORITE_SEC = 8;
/** Shorter glow after any other snack. */
export const SATISFIED_ANY_SEC = 2.5;
/** Seconds between nibble particle puffs. */
export const NIBBLE_FX_COOLDOWN = 0.16;
/** How long an ant hauls a crumb toward cover. */
export const CARRY_DURATION_SEC = 6;

/** Seconds between kills that still count as a combo chain. */
export const COMBO_WINDOW = 2.0;
export const COMBO_TEXT_LIFE = 0.9;
/** Low-probability chonky bug: 2–3× size, 3 HP. */
export const FAT_BUG_CHANCE = 0.06;
export const FAT_BUG_HP = 3;
export const FAT_BUG_SIZE_MIN = 2.0;
export const FAT_BUG_SIZE_MAX = 3.0;
export const MAX_FLOATS = 8;
