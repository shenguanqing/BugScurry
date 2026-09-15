import { HIT_RADIUS_CHASE, HIT_RADIUS_SCALE, REPELLENT_RADIUS } from "./config";
import type { Bug, Viewport } from "./types";

export function hitTestBug(
  bugs: Bug[],
  x: number,
  y: number,
  _viewport: Viewport,
): Bug | null {
  // Topmost last-drawn bug wins: search from end.
  for (let i = bugs.length - 1; i >= 0; i--) {
    const bug = bugs[i];
    if (bug.state === "squishing" || bug.state === "dying") continue;
    const dx = x - bug.x;
    const dy = y - bug.y;
    const dist = Math.hypot(dx, dy);
    // Already on top of it → wider hit radius so a chase still connects.
    const scale = dist <= REPELLENT_RADIUS ? HIT_RADIUS_CHASE : HIT_RADIUS_SCALE;
    const r = bug.size * scale;
    if (dist <= r) return bug;
  }
  return null;
}
