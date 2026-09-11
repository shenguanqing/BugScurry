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
