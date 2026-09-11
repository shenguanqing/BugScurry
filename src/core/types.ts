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
  seed: number;
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
}

export type TrayCommand =
  | "toggle_visibility"
  | "add_one"
  | "remove_one"
  | "regenerate"
  | "open_settings";
