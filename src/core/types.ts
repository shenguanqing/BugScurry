export type Personality = "shy" | "greedy" | "lazy" | "curious";
export type FoodKind = "cookie" | "sugar" | "fruit";
export type DayPhase = "dawn" | "day" | "dusk" | "night";
export type RainKind =
  | "light"
  | "moderate"
  | "heavy"
  | "downpour"
  | "thunder"
  | "snow"
  | "fog"
  | "sand";

export type BugState =
  | "crawling"
  | "paused"
  | "squishing"
  | "dying";

export interface Bug {
  id: string;
  species: string;
  personality: Personality;
  eatingBaitId: string | null;
  enjoyingFood: boolean;
  /** Seconds before willing to nibble again after skittish bugs bail. */
  foodCooldown: number;
  /** Post-meal glow remaining; favorite food lasts longer. */
  satisfiedTimer: number;
  /** Crumb hauled away after an ant-style carry peck. */
  carryKind: FoodKind | null;
  /** Seconds left hauling the crumb toward cover. */
  carryTimer: number;
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

/** Temporary food that attracts nearby bugs. */
export interface Bait {
  id: string;
  kind: FoodKind;
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
  /** Rain on/off. Bugs hug edges; streaks fall on the overlay. */
  rain: boolean;
  /** Current shower strength. Re-rolled each time rain starts. */
  rainKind: RainKind;
  /** Base wind lean for this shower, -1 (left) .. 1 (right). */
  rainWind: number;
  /** Let the app start/stop rain on its own schedule. */
  autoRain: boolean;
  /** Auto-roll prank chaos events (currently: bug swarm). */
  randomEvents: boolean;
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
  | "drop_sugar"
  | "drop_fruit"
  | "rain_off"
  | "rain_light"
  | "rain_moderate"
  | "rain_heavy"
  | "rain_downpour"
  | "rain_thunder"
  | "rain_snow"
  | "rain_fog"
  | "rain_sand"
  | "prank_spray"
  | "open_settings";

/** Chaos events rolled by Settings → Random events (and the debug panel). */
export type RandomEventKind =
  | "swarm"
  | "fat_invasion"
  | "berserk"
  | "size_chaos"
  | "night_raid";
