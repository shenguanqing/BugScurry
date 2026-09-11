import { DEATH_FADE_DURATION, SQUISH_DURATION } from "./config";
import type { Bug } from "./types";

export function startSquish(bug: Bug): void {
  if (bug.state === "squishing" || bug.state === "dying") return;
  bug.state = "squishing";
  bug.stateTimer = SQUISH_DURATION;
  bug.deathProgress = 0;
}

export function updateSquish(bug: Bug, dt: number): void {
  if (bug.state === "squishing") {
    bug.stateTimer -= dt;
    bug.deathProgress = Math.min(1, 1 - bug.stateTimer / SQUISH_DURATION);
    if (bug.stateTimer <= 0) {
      bug.state = "dying";
      bug.stateTimer = DEATH_FADE_DURATION;
      bug.deathProgress = 0;
    }
    return;
  }

  if (bug.state === "dying") {
    bug.stateTimer -= dt;
    bug.deathProgress = Math.min(1, 1 - bug.stateTimer / DEATH_FADE_DURATION);
  }
}

export function isBugDead(bug: Bug): boolean {
  return bug.state === "dying" && bug.deathProgress >= 1;
}

/** Shared pressure envelope for anatomy and effects; continuous across states. */
export function squishPressure(bug: Bug): number {
  if (bug.state === "dying") return 1;
  if (bug.state !== "squishing") return 0;
  const t = Math.min(1, Math.max(0, bug.deathProgress / 0.38));
  return 1 - Math.pow(1 - t, 3);
}
