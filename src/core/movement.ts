import {
  BAIT_ATTRACT_RADIUS,
  BAIT_NIBBLE_RADIUS,
  BAIT_PULL,
  EDGE_MARGIN,
  REPELLENT_PANIC_RADIUS,
  REPELLENT_RADIUS,
  REPELLENT_SPEED_MAX,
  REPELLENT_SPEED_MIN,
  STUCK_TIMEOUT,
} from "./config";
import { Rng, randomSeed } from "./rng";
import type { Bait, Bug, CursorState, Settings, Viewport } from "./types";

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

function wallDistances(bug: Bug, viewport: Viewport) {
  return {
    left: bug.x,
    right: viewport.width - bug.x,
    top: bug.y,
    bottom: viewport.height - bug.y,
  };
}

/** When near two walls, pick a diagonal heading that leaves the corner. */
function cornerEscapeHeading(bug: Bug, viewport: Viewport, rng: Rng): number | null {
  const pad = Math.max(bug.size * 0.6, 14);
  const w = wallDistances(bug, viewport);
  const nearX = Math.min(w.left, w.right) < EDGE_MARGIN + pad;
  const nearY = Math.min(w.top, w.bottom) < EDGE_MARGIN + pad;
  if (!nearX || !nearY) return null;

  const dx = w.left < w.right ? 1 : -1;
  const dy = w.top < w.bottom ? 1 : -1;
  const base = Math.atan2(dy, dx);
  return normalizeAngle(base + rng.range(-0.45, 0.45));
}

/**
 * Cursor scare response. Always flees while the cursor is inside the
 * repellent radius (bugs keep running). Panic = almost on top of them:
 * full-speed bolt with a less coordinated heading.
 */
function cursorFlee(
  bug: Bug,
  settings: Settings,
  cursor: CursorState | null,
): { heading: number; urgency: number; panic: boolean } | null {
  if (!settings.repellent || !cursor || !cursor.inside) return null;
  const dx = bug.x - cursor.x;
  const dy = bug.y - cursor.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= REPELLENT_RADIUS) return null;
  const urgency = 1 - dist / Math.max(1, REPELLENT_RADIUS);
  const heading = Math.atan2(dy, dx);
  return { heading, urgency, panic: dist < REPELLENT_PANIC_RADIUS };
}

/** Heading + distance toward a live bait crumb, or null if out of range. */
function baitSteer(bug: Bug, bait: Bait | null): { heading: number; dist: number } | null {
  if (!bait || bait.life <= 0) return null;
  const dx = bait.x - bug.x;
  const dy = bait.y - bug.y;
  const dist = Math.hypot(dx, dy);
  if (dist > BAIT_ATTRACT_RADIUS) return null;
  return { heading: Math.atan2(dy, dx), dist };
}

export function updateBug(
  bug: Bug,
  dt: number,
  settings: Settings,
  viewport: Viewport,
  rng: Rng,
  cursor: CursorState | null = null,
  bait: Bait | null = null,
): void {
  if (bug.state === "squishing" || bug.state === "dying") return;

  bug.stateTimer -= dt;
  bug.legPhase = (bug.legPhase + dt * (2.5 + bug.speed / 34)) % 1;

  const escapeNow = cornerEscapeHeading(bug, viewport, rng);
  const flee = cursorFlee(bug, settings, cursor);
  const towardBait = baitSteer(bug, bait);

  if (bug.state === "paused") {
    if (flee) {
      bug.state = "crawling";
      bug.heading = flee.heading;
      bug.stateTimer = Math.max(bug.stateTimer, 0.4);
      bug.turnBias = 0;
      bug.stuckTime = 0;
    } else if (escapeNow !== null) {
      bug.state = "crawling";
      bug.heading = escapeNow;
      bug.stateTimer = rng.range(0.7, 1.3);
      bug.turnBias = 0;
      bug.stuckTime = 0;
    } else if (bug.stateTimer <= 0) {
      bug.state = "crawling";
      bug.stateTimer = rng.range(0.7, 2.6);
      bug.turnBias = rng.range(-1.0, 1.0) * settings.randomness;
    } else {
      return;
    }
  }

  if (bug.stateTimer <= 0 && escapeNow === null && !flee) {
    if (rng.chance(0.22 + settings.randomness * 0.35)) {
      bug.state = "paused";
      bug.stateTimer = rng.range(0.18, 0.75);
      return;
    }
    bug.turnBias = rng.range(-1.6, 1.6) * settings.randomness;
    bug.stateTimer = rng.range(0.45, 1.8);
    bug.speed = Math.max(24, bug.speed * rng.range(0.94, 1.06));
  }

  const prevX = bug.x;
  const prevY = bug.y;

  const wander = (rng.next() - 0.5) * (0.9 + settings.randomness * 2.0) * dt;
  bug.heading = normalizeAngle(bug.heading + wander + bug.turnBias * dt);

  let speedBoost = 1;

  if (flee) {
    const pull = 14 + flee.urgency * 20;
    bug.heading = steerToward(bug.heading, flee.heading, dt, pull);
    if (flee.panic) {
      // Startle: still running, but heading wobbles — less machine-precise.
      bug.heading = normalizeAngle(bug.heading + (rng.next() - 0.5) * 7 * dt);
    }
    bug.state = "crawling";
    bug.stateTimer = Math.max(bug.stateTimer, 0.35);
    bug.turnBias = 0;
    speedBoost =
      REPELLENT_SPEED_MIN +
      flee.urgency * (REPELLENT_SPEED_MAX - REPELLENT_SPEED_MIN);
  } else if (escapeNow !== null) {
    bug.heading = escapeNow;
    bug.state = "crawling";
    bug.stateTimer = Math.max(bug.stateTimer, 0.8);
    bug.turnBias = 0;
    speedBoost = 1.45;
  } else if (towardBait && towardBait.dist > BAIT_NIBBLE_RADIUS) {
    // Soft bias toward the crumb — not a formation, just a heading pull.
    const urgency = 1 - towardBait.dist / BAIT_ATTRACT_RADIUS;
    const pull = BAIT_PULL * (0.55 + urgency * 0.9);
    bug.heading = steerToward(bug.heading, towardBait.heading, dt, pull);
    bug.state = "crawling";
    bug.turnBias = 0;
    speedBoost = 1 + urgency * 0.35;
  } else if (towardBait && towardBait.dist <= BAIT_NIBBLE_RADIUS) {
    // Nibbling: stop on the crumb.
    bug.state = "paused";
    bug.stateTimer = Math.max(bug.stateTimer, rng.range(0.25, 0.7));
    bug.turnBias = 0;
    bug.heading = steerToward(bug.heading, towardBait.heading, dt, 6);
    return;
  } else {
    const w = wallDistances(bug, viewport);
    const m = EDGE_MARGIN + bug.size * 0.4;
    const nearLeft = w.left < m;
    const nearRight = w.right < m;
    const nearTop = w.top < m;
    const nearBottom = w.bottom < m;
    const sides = [nearLeft, nearRight, nearTop, nearBottom].filter(Boolean).length;

    if (sides === 1) {
      let target = bug.heading;
      if (nearLeft) target = Math.PI / 2;
      else if (nearRight) target = -Math.PI / 2;
      else if (nearTop) target = 0;
      else if (nearBottom) target = Math.PI;

      if (rng.chance(0.02)) target = normalizeAngle(target + Math.PI);

      const pull = 2.2 + bug.edgeAffinity * 4.5;
      bug.heading = steerToward(bug.heading, target, dt, pull);
    } else if (sides === 0 && bug.edgeAffinity > 0.7 && rng.chance(0.25)) {
      const options = [
        { t: Math.PI / 2, d: w.left },
        { t: -Math.PI / 2, d: w.right },
        { t: 0, d: w.top },
        { t: Math.PI, d: w.bottom },
      ];
      options.sort((a, b) => a.d - b.d);
      bug.heading = steerToward(bug.heading, options[0].t, dt, 1.8);
    }
  }

  const speed =
    bug.speed * settings.speed * (0.88 + bug.seed * 0.24) * speedBoost;
  bug.x += Math.cos(bug.heading) * speed * dt;
  bug.y += Math.sin(bug.heading) * speed * dt;

  const pad = Math.max(bug.size * 0.42, 10);
  bug.x = Math.min(viewport.width - pad, Math.max(pad, bug.x));
  bug.y = Math.min(viewport.height - pad, Math.max(pad, bug.y));

  const moved = Math.hypot(bug.x - prevX, bug.y - prevY);
  const w2 = wallDistances(bug, viewport);
  const nearEdge = Math.min(w2.left, w2.right, w2.top, w2.bottom) < EDGE_MARGIN * 2.2;
  if (nearEdge && moved < speed * dt * 0.25) {
    bug.stuckTime += dt;
  } else {
    bug.stuckTime = Math.max(0, bug.stuckTime - dt * 2);
  }

  if (bug.stuckTime > STUCK_TIMEOUT) {
    const towardCenter = Math.atan2(
      viewport.height / 2 - bug.y,
      viewport.width / 2 - bug.x,
    );
    bug.heading = normalizeAngle(towardCenter + rng.range(-0.7, 0.7));
    const kick = 10 + bug.size * 0.35;
    bug.x += Math.cos(bug.heading) * kick;
    bug.y += Math.sin(bug.heading) * kick;
    bug.x = Math.min(viewport.width - pad, Math.max(pad, bug.x));
    bug.y = Math.min(viewport.height - pad, Math.max(pad, bug.y));
    bug.stuckTime = 0;
    bug.state = "crawling";
    bug.stateTimer = 1.0;
    bug.turnBias = 0;
  }
}

export function updateBugs(
  bugs: Bug[],
  dt: number,
  settings: Settings,
  viewport: Viewport,
  cursor: CursorState | null = null,
  bait: Bait | null = null,
): void {
  const rng = new Rng(randomSeed());
  for (const bug of bugs) {
    updateBug(bug, dt, settings, viewport, rng, cursor, bait);
  }
}