import { EDGE_MARGIN } from "./config";
import { Rng, randomSeed } from "./rng";
import type { Bug, Settings, Viewport } from "./types";

const TWO_PI = Math.PI * 2;

function normalizeAngle(a: number): number {
  let x = a % TWO_PI;
  if (x < 0) x += TWO_PI;
  return x;
}

function shortestAngleDiff(from: number, to: number): number {
  let d = normalizeAngle(to - from);
  if (d > Math.PI) d -= TWO_PI;
  return d;
}

function steerToward(heading: number, target: number, dt: number, rate: number): number {
  return normalizeAngle(heading + shortestAngleDiff(heading, target) * dt * rate);
}

export function updateBug(
  bug: Bug,
  dt: number,
  settings: Settings,
  viewport: Viewport,
  rng: Rng,
): void {
  if (bug.state === "squishing" || bug.state === "dying") return;

  bug.stateTimer -= dt;
  bug.legPhase = (bug.legPhase + dt * (2.2 + bug.speed / 40)) % 1;

  if (bug.state === "paused") {
    if (bug.stateTimer <= 0) {
      bug.state = "crawling";
      bug.stateTimer = rng.range(0.8, 2.8);
      bug.turnBias = rng.range(-1.2, 1.2) * settings.randomness;
    }
    return;
  }

  if (bug.stateTimer <= 0) {
    if (rng.chance(0.35 + settings.randomness * 0.4)) {
      bug.state = "paused";
      bug.stateTimer = rng.range(0.25, 1.1);
      return;
    }
    bug.turnBias = rng.range(-1.6, 1.6) * settings.randomness;
    bug.stateTimer = rng.range(0.5, 2.0);
    bug.speed = Math.max(20, bug.speed * rng.range(0.9, 1.1));
  }

  const wander = (rng.next() - 0.5) * (0.8 + settings.randomness * 1.8) * dt;
  bug.heading = normalizeAngle(bug.heading + wander + bug.turnBias * dt);

  // Soft steer away from edges (slide / turn back in)
  const m = EDGE_MARGIN;
  const { width, height } = viewport;
  if (bug.y < m) bug.heading = steerToward(bug.heading, Math.PI / 2, dt, 5);
  else if (bug.y > height - m) bug.heading = steerToward(bug.heading, -Math.PI / 2, dt, 5);
  if (bug.x < m) bug.heading = steerToward(bug.heading, 0, dt, 5);
  else if (bug.x > width - m) bug.heading = steerToward(bug.heading, Math.PI, dt, 5);

  const speed = bug.speed * settings.speed;
  bug.x += Math.cos(bug.heading) * speed * dt;
  bug.y += Math.sin(bug.heading) * speed * dt;

  const pad = bug.size * 0.4;
  bug.x = Math.min(width - pad, Math.max(pad, bug.x));
  bug.y = Math.min(height - pad, Math.max(pad, bug.y));
}

export function updateBugs(
  bugs: Bug[],
  dt: number,
  settings: Settings,
  viewport: Viewport,
): void {
  const rng = new Rng(randomSeed());
  for (const bug of bugs) {
    updateBug(bug, dt, settings, viewport, rng);
  }
}
