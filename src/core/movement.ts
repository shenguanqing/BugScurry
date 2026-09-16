import {
  BAIT_NIBBLE_RADIUS,
  BAIT_PULL,
  CARRY_DURATION_SEC,
  EDGE_MARGIN,
  REPELLENT_PANIC_RADIUS,
  REPELLENT_RADIUS,
  REPELLENT_SPEED_MAX,
  REPELLENT_SPEED_MIN,
  SATISFIED_ANY_SEC,
  SATISFIED_FAVORITE_SEC,
  STUCK_TIMEOUT,
} from "./config";
import { foodInterest, foodRadius, resolveEatPlan, selectBait } from "./feeding";
import { PERSONALITY_TRAITS } from "./personality";
import { activeRainMotion } from "./weather";
import { getSpecies } from "../species";
import { Rng } from "./rng";
import type { Bait, Bug, CursorState, Settings, Viewport } from "./types";

// Weak keys release random streams when their bugs are removed.
const movementRngs = new WeakMap<Bug, Rng>();

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
  const radius = REPELLENT_RADIUS * PERSONALITY_TRAITS[bug.personality].fleeRadius;
  if (dist >= radius) return null;
  const urgency = 1 - dist / radius;
  const heading = Math.atan2(dy, dx);
  return { heading, urgency, panic: dist < REPELLENT_PANIC_RADIUS };
}

/** Heading + distance toward a live bait crumb, or null if out of range. */
function baitSteer(bug: Bug, bait: Bait | null): { heading: number; dist: number } | null {
  if (!bait || bait.life <= 0) return null;
  const dx = bait.x - bug.x;
  const dy = bait.y - bug.y;
  const dist = Math.hypot(dx, dy);
  if (dist > foodRadius(bug, bait)) return null;
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

  const personality = PERSONALITY_TRAITS[bug.personality];
  const species = getSpecies(bug.species);
  const eatPlan = resolveEatPlan(bug.personality, species?.traits.eatStyle);
  const prevEatingId = bug.eatingBaitId;
  bug.eatingBaitId = null;
  bug.enjoyingFood = false;
  bug.foodCooldown = Math.max(0, bug.foodCooldown - dt);
  bug.satisfiedTimer = Math.max(0, bug.satisfiedTimer - dt);
  bug.carryTimer = Math.max(0, bug.carryTimer - dt);
  if (bug.carryTimer <= 0) bug.carryKind = null;
  bug.stateTimer -= dt;
  bug.legPhase += dt * (2.5 + bug.speed / 34);
  // Eating slows the walk cycle so nibbles read as munching, not sprinting.
  if (bug.eatingBaitId || (bug.foodCooldown <= 0 && bug.state === "paused")) {
    bug.legPhase += dt * 0.35;
  }
  bug.legPhase %= 1;

  const escapeNow = cornerEscapeHeading(bug, viewport, rng);
  const flee = cursorFlee(bug, settings, cursor);
  const towardBait = baitSteer(bug, bait);
  const wet = activeRainMotion(settings);

  if (
    !bug.carryKind &&
    !flee &&
    bait &&
    towardBait &&
    towardBait.dist <= BAIT_NIBBLE_RADIUS &&
    bug.foodCooldown <= 0
  ) {
    const favorite = species?.traits.favoriteFood === bait.kind;
    // Probe styles pause longer on the first contact before the real bite.
    const hold =
      eatPlan.hold * (favorite ? 1.25 : 1) * (eatPlan.probe && prevEatingId !== bait.id ? 1.6 : 1);
    const justStarted = prevEatingId !== bait.id;
    if (justStarted) {
      bug.state = "paused";
      bug.stateTimer = hold;
    } else if (eatPlan.cling) {
      bug.stateTimer = Math.max(bug.stateTimer, hold * 0.55);
    }
    bug.turnBias = 0;
    bug.eatingBaitId = bait.id;
    bug.enjoyingFood = favorite;
    bug.satisfiedTimer = Math.max(
      bug.satisfiedTimer,
      favorite ? SATISFIED_FAVORITE_SEC * 0.45 : SATISFIED_ANY_SEC * 0.45,
    );
    bug.heading = steerToward(bug.heading, towardBait.heading, dt, 6);

    if (!eatPlan.cling && bug.stateTimer <= 0) {
      bug.foodCooldown = eatPlan.cooldown;
      bug.eatingBaitId = null;
      bug.enjoyingFood = false;
      bug.satisfiedTimer = Math.max(
        bug.satisfiedTimer,
        favorite ? SATISFIED_FAVORITE_SEC : SATISFIED_ANY_SEC,
      );
      bug.state = "crawling";
      bug.stateTimer = 0.45;
      if (eatPlan.carry) {
        // Ant-style: peel off a crumb and haul it toward cover.
        bug.carryKind = bait.kind;
        bug.carryTimer = CARRY_DURATION_SEC;
        bug.heading = normalizeAngle(
          Math.atan2(viewport.height / 2 - bug.y, viewport.width / 2 - bug.x) +
            Math.PI +
            rng.range(-0.4, 0.4),
        );
      } else {
        const away = Math.atan2(bug.y - bait.y, bug.x - bait.x);
        bug.heading = normalizeAngle(away + rng.range(-0.5, 0.5));
      }
      bug.speed = Math.max(bug.speed, bug.speed * 1.15);
    }
    return;
  }

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
    } else if (bug.stateTimer <= 0 || (towardBait && bug.personality === "greedy")) {
      bug.state = "crawling";
      bug.stateTimer = rng.range(0.7, 2.6);
      bug.turnBias = rng.range(-1.0, 1.0) * settings.randomness;
    } else {
      return;
    }
  }

  if (bug.stateTimer <= 0 && escapeNow === null && !flee && !bug.carryKind) {
    const pauseChance = (0.22 + settings.randomness * 0.35) * (wet ? wet.pauseMul : 1);
    if (rng.chance(Math.min(0.72, pauseChance))) {
      bug.state = "paused";
      bug.stateTimer = rng.range(0.18, 0.75) * personality.pause * (wet ? wet.pauseMul : 1);
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
  } else if (bug.carryKind) {
    // Ant haul: purposeful walk toward the nearest cover, slightly slower.
    const w = wallDistances(bug, viewport);
    const options = [
      { t: Math.PI, d: w.left },
      { t: 0, d: w.right },
      { t: -Math.PI / 2, d: w.top },
      { t: Math.PI / 2, d: w.bottom },
    ];
    options.sort((a, b) => a.d - b.d);
    bug.heading = steerToward(bug.heading, options[0].t, dt, 3.4);
    bug.state = "crawling";
    bug.stateTimer = Math.max(bug.stateTimer, 0.3);
    bug.turnBias = 0;
    speedBoost = 0.92;
  } else if (bait && towardBait) {
    // Soft bias toward the crumb — not a formation, just a heading pull.
    const urgency = 1 - towardBait.dist / foodRadius(bug, bait);
    const pull = BAIT_PULL * foodInterest(bug, bait.kind) * (0.55 + urgency * 0.9);
    bug.heading = steerToward(bug.heading, towardBait.heading, dt, pull);
    bug.state = "crawling";
    bug.turnBias = 0;
    speedBoost = 1 + urgency * 0.35;
  } else if (
    bug.personality === "curious" && settings.repellent && cursor?.inside &&
    Math.hypot(cursor.x - bug.x, cursor.y - bug.y) < REPELLENT_RADIUS * 2.3
  ) {
    // Investigate from a distance; the normal flee response wins up close.
    const target = Math.atan2(cursor.y - bug.y, cursor.x - bug.x);
    bug.heading = steerToward(bug.heading, target, dt, 2.5);
    bug.turnBias = 0;
    speedBoost = 0.7;
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

      const pull = (2.2 + bug.edgeAffinity * 4.5) * (wet ? wet.edgePull : 1);
      bug.heading = steerToward(bug.heading, target, dt, pull);
    } else if (sides === 0 && (wet || (bug.edgeAffinity > 0.7 && rng.chance(0.25)))) {
      // Rain always steers toward the nearest cover; dry bugs only if they like walls.
      // Screen coords: heading 0 = right, π/2 = down — cover needs INTO the wall, not along it.
      const options = [
        { t: Math.PI, d: w.left },
        { t: 0, d: w.right },
        { t: -Math.PI / 2, d: w.top },
        { t: Math.PI / 2, d: w.bottom },
      ];
      options.sort((a, b) => a.d - b.d);
      bug.heading = steerToward(bug.heading, options[0].t, dt, wet ? wet.coverPull : 1.8);
    }
  }

  const rainMul = wet ? wet.speedMul : 1;
  const speed =
    bug.speed * settings.speed * personality.speed * (0.88 + bug.seed * 0.24) * speedBoost * rainMul;
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
  baits: readonly Bait[] = [],
): void {
  for (const bug of bugs) {
    let rng = movementRngs.get(bug);
    if (!rng) {
      rng = new Rng(Math.floor(bug.seed * 4294967296));
      movementRngs.set(bug, rng);
    }
    updateBug(bug, dt, settings, viewport, rng, cursor, selectBait(bug, baits));
  }
}
