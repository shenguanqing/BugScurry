import type { BugManager } from "./bugManager";
import { EVENT_BANNER, PRANK, RANDOM_EVENT_GAP_SEC } from "./config";
import type { RandomEventKind } from "./types";

export const RANDOM_EVENT_KINDS: readonly RandomEventKind[] = [
  "swarm",
  "fat_invasion",
  "berserk",
  "size_chaos",
  "night_raid",
];

export function rollRandomEvent(rng: () => number = Math.random): RandomEventKind {
  const i = Math.min(
    RANDOM_EVENT_KINDS.length - 1,
    Math.floor(rng() * RANDOM_EVENT_KINDS.length),
  );
  return RANDOM_EVENT_KINDS[i];
}

/** How long the event occupies the scene after the banner (for auto re-arm). */
export function eventBusyMs(kind: RandomEventKind): number {
  switch (kind) {
    case "swarm":
      return (PRANK.swarmPeakSec + PRANK.swarmFallSec) * 1000;
    case "berserk":
      return PRANK.berserkSec * 1000;
    case "size_chaos":
      return PRANK.sizeChaosSec * 1000;
    default:
      return 0;
  }
}

/** Banner lead-in + hold, shared by every event. */
export function eventBannerMs(): number {
  return EVENT_BANNER.showMs + EVENT_BANNER.hideMs;
}

export interface AutoEventClock {
  dueAtMs: number;
}

export function nextEventGapMs(rng: () => number = Math.random): number {
  const { min, max } = RANDOM_EVENT_GAP_SEC;
  return (min + rng() * (max - min)) * 1000;
}

export function createAutoEventClock(
  nowMs: number,
  rng: () => number = Math.random,
): AutoEventClock {
  return { dueAtMs: nowMs + nextEventGapMs(rng) };
}

export function resetAutoEventClock(
  clock: AutoEventClock,
  nowMs: number,
  rng: () => number = Math.random,
): void {
  clock.dueAtMs = nowMs + nextEventGapMs(rng);
}

/** True when the clock is due. Caller fires the event and re-arms. */
export function tickAutoEvent(clock: AutoEventClock, nowMs: number): boolean {
  return nowMs >= clock.dueAtMs;
}

/**
 * Re-arm after an event so the next one waits for the active window plus a gap.
 * `busyMs` is how long the fired event occupies the scene (e.g. swarm peak+fall).
 */
export function rearmAfterEvent(
  clock: AutoEventClock,
  nowMs: number,
  busyMs: number,
  rng: () => number = Math.random,
): void {
  clock.dueAtMs = nowMs + busyMs + nextEventGapMs(rng);
}

/** Shared event dispatch for the native overlay and the local QA scene. */
export function applyRandomEventToManager(manager: BugManager, kind: RandomEventKind, nowMs: number): void {
  switch (kind) {
    case "swarm": manager.startSwarm(nowMs); break;
    case "fat_invasion": manager.startFatInvasion(); break;
    case "berserk": manager.startBerserk(nowMs); break;
    case "size_chaos": manager.startSizeChaos(nowMs); break;
    case "night_raid": manager.startNightRaid(); break;
  }
}
