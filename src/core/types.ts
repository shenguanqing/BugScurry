export type BugState =
  | "crawling"
  | "paused"
  | "squishing"
  | "dying";

export interface Bug {
  id: string;
  species: string;
  x: number;
  y: number;
  /** radians */
  heading: number;
  speed: number;
  size: number;
  state: BugState;
  /** walk cycle phase 0..1 */
  legPhase: number;
  /** seconds remaining in current state */
  stateTimer: number;
  /** squish progress 0..1 while dying */
  deathProgress: number;
  /** small heading jitter */
  turnBias: number;
  /** edge-hug preference 0..1, higher = likes walls */
  edgeAffinity: number;
  /** seconds spent barely moving near an edge */
  stuckTime: number;
  seed: number;
  /** Hits remaining; 1 = dies on first squish. Fat bugs start at 3. */
  hp: number;
  /** Spawn-time HP (1 = normal, 3 = fat). */
  maxHp: number;
  /** Seconds of red-flash after a non-lethal hit. */
  hurtTimer: number;
}

/** Cookie crumb that briefly attracts nearby bugs. */
export interface Bait {
  id: string;
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
}

export interface Stain {
  heading: number;
  id: string;
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
  species: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface Settings {
  count: number;
  size: number;
  speed: number;
  randomness: number;
  sound: boolean;
  stains: boolean;
  particles: boolean;
  /** Bugs flee when the cursor gets close */
  repellent: boolean;
  autostart: boolean;
  monitorMode: "primary" | "all";
  /** "random" or a species id */
  species: string;
  /** UI theme: light | dark | auto (follow system) */
  theme: "light" | "dark" | "auto";
  /** UI language: zh-CN | zh-TW | en | ja | ko | auto */
  locale: "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "auto";
}

/** Cursor position in the overlay window's local CSS pixels. */
export interface CursorState {
  x: number;
  y: number;
  inside: boolean;
}

/** Floating combo / feedback text on the overlay. */
export interface FloatText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  /** 1 = normal, 2+ = bigger gold combo */
  tier: number;
}

/** Rolling daily kill stats (local date). */
export interface DailyStats {
  /** YYYY-MM-DD in local time */
  date: string;
  kills: number;
  bestCombo: number;
}

export type TrayCommand =
  | "toggle_visibility"
  | "add_one"
  | "remove_one"
  | "regenerate"
  | "drop_bait"
  | "open_settings";
