export type BugState = "crawling" | "paused" | "squishing" | "dying";

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
  autostart: boolean;
  monitorMode: "primary" | "all";
  /** "random" or a species id */
  species: string;
  /** UI theme: light | dark | auto (follow system) */
  theme: "light" | "dark" | "auto";
  /** UI language: zh-CN | en | auto */
  locale: "zh-CN" | "en" | "auto";
}

export type TrayCommand =
  | "toggle_visibility"
  | "add_one"
  | "remove_one"
  | "regenerate"
  | "open_settings";
