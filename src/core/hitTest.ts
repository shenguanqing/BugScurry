import { HIT_RADIUS_SCALE } from "./config";
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
    const r = bug.size * HIT_RADIUS_SCALE;
    const dx = x - bug.x;
    const dy = y - bug.y;
    if (dx * dx + dy * dy <= r * r) return bug;
  }
  return null;
}
