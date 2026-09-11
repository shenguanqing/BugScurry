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

/** Distance to nearest wall and preferred wall-parallel direction. */
function wallSteer(bug: Bug, viewport: Viewport): { target: number; weight: number } | null {
  const { width, height } = viewport;
  const m = EDGE_MARGIN + bug.size * 0.3;
  const distLeft = bug.x;
  const distRight = width - bug.x;
  const distTop = bug.y;
  const distBottom = height - bug.y;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist > m * 2.4) return null;

  // Prefer sliding along the closest wall
  if (minDist === distLeft) return { target: Math.PI / 2, weight: 1 };
  if (minDist === distRight) return { target: -Math.PI / 2, weight: 1 };
  if (minDist === distTop) return { target: 0, weight: 1 };
  return { target: Math.PI, weight: 1 };
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
  bug.legPhase = (bug.legPhase + dt * (2.4 + bug.speed / 36)) % 1;

  if (bug.state === "paused") {
    if (bug.stateTimer <= 0) {
      bug.state = "crawling";
      bug.stateTimer = rng.range(0.7, 2.6);
      bug.turnBias = rng.range(-1.0, 1.0) * settings.randomness;
    }
    return;
  }

  if (bug.stateTimer <= 0) {
    if (rng.chance(0.3 + settings.randomness * 0.45)) {
      bug.state = "paused";
      bug.stateTimer = rng.range(0.2, 0.95);
      return;
    }
    bug.turnBias = rng.range(-1.8, 1.8) * settings.randomness;
    bug.stateTimer = rng.range(0.4, 1.8);
    bug.speed = Math.max(24, bug.speed * rng.range(0.92, 1.08));
  }

  // Organic wander
  const wander = (rng.next() - 0.5) * (1.0 + settings.randomness * 2.2) * dt;
  bug.heading = normalizeAngle(bug.heading + wander + bug.turnBias * dt);

  // Edge hug: high edgeAffinity keeps them along borders
  const wall = wallSteer(bug, viewport);
  if (wall) {
    const pull = 3.5 + bug.edgeAffinity * 6;
    bug.heading = steerToward(bug.heading, wall.target, dt, pull);
  } else if (bug.edgeAffinity > 0.65) {
    // Occasionally aim back toward nearest wall
    const { width, height } = viewport;
    const options = [
      { t: Math.PI / 2, d: bug.x },
      { t: -Math.PI / 2, d: width - bug.x },
      { t: 0, d: bug.y },
      { t: Math.PI, d: height - bug.y },
    ];
    options.sort((a, b) => a.d - b.d);
    if (rng.chance(0.35)) {
      bug.heading = steerToward(bug.heading, options[0].t, dt, 1.8);
    }
  }

  const speed = bug.speed * settings.speed * (0.85 + bug.seed * 0.3);
  bug.x += Math.cos(bug.heading) * speed * dt;
  bug.y += Math.sin(bug.heading) * speed * dt;

  const pad = bug.size * 0.35;
  bug.x = Math.min(viewport.width - pad, Math.max(pad, bug.x));
  bug.y = Math.min(viewport.height - pad, Math.max(pad, bug.y));
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
