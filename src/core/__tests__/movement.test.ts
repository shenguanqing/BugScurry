import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  EDGE_MARGIN,
  REPELLENT_PANIC_RADIUS,
  REPELLENT_RADIUS,
  REPELLENT_SPEED_MIN,
} from "../config";
import { updateBug } from "../movement";
import { Rng } from "../rng";
import type { Bug, CursorState, Settings, Viewport } from "../types";

const viewport: Viewport = { width: 800, height: 600, dpr: 1 };
const settings: Settings = { ...DEFAULT_SETTINGS, count: 1, speed: 1, randomness: 0.5 };

function bug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: "bug-1",
    species: "cockroach",
    x: 400,
    y: 300,
    heading: 0,
    speed: 70,
    size: 15,
    state: "crawling",
    legPhase: 0,
    stateTimer: 5,
    deathProgress: 0,
    turnBias: 0,
    edgeAffinity: 0.5,
    stuckTime: 0,
    seed: 0.5,
    hp: 1,
    maxHp: 1,
    hurtTimer: 0,
    ...overrides,
  };
}

function cursor(x: number, y: number, inside = true): CursorState {
  return { x, y, inside };
}

describe("updateBug", () => {
  it("keeps the bug inside the viewport", () => {
    const b = bug({ x: 5, y: 5, heading: Math.PI, stateTimer: 5 });
    const rng = new Rng(11);
    for (let i = 0; i < 120; i++) {
      updateBug(b, 1 / 60, settings, viewport, rng);
    }
    expect(b.x).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(viewport.width);
    expect(b.y).toBeLessThan(viewport.height);
  });

  it("does not move squishing or dying bugs", () => {
    const b = bug({ state: "squishing", x: 100, y: 100, heading: 0 });
    const before = { x: b.x, y: b.y, heading: b.heading };
    updateBug(b, 0.1, settings, viewport, new Rng(3));
    expect(b.x).toBe(before.x);
    expect(b.y).toBe(before.y);
    expect(b.heading).toBe(before.heading);
  });

  it("escapes a corner when paused", () => {
    const b = bug({
      x: 4,
      y: 4,
      state: "paused",
      stateTimer: 10,
      heading: Math.PI / 2,
    });
    const rng = new Rng(21);
    updateBug(b, 1 / 60, settings, viewport, rng);
    expect(b.state).toBe("crawling");
    expect(b.heading).toBeGreaterThan(0);
    expect(b.heading).toBeLessThan(Math.PI / 2);
  });

  it("advances legPhase over time", () => {
    const b = bug({ legPhase: 0 });
    updateBug(b, 0.1, settings, viewport, new Rng(9));
    expect(b.legPhase).toBeGreaterThan(0);
    expect(b.legPhase).toBeLessThan(1);
  });

  it("slides along a single wall instead of facing into it", () => {
    const b = bug({ x: 8, y: 300, heading: Math.PI, stateTimer: 5, edgeAffinity: 1 });
    const rng = new Rng(33);
    for (let i = 0; i < 30; i++) {
      updateBug(b, 1 / 60, settings, viewport, rng);
    }
    const leftish = Math.cos(b.heading) < -0.9;
    expect(leftish).toBe(false);
    expect(b.x).toBeGreaterThanOrEqual(EDGE_MARGIN * 0.5);
  });

  it("turns away from a cursor in the flee band", () => {
    const dist = REPELLENT_RADIUS * 0.7;
    const b = bug({ x: 400, y: 300, heading: 0, stateTimer: 5 });
    const rng = new Rng(17);
    const c = cursor(400 + dist, 300);
    for (let i = 0; i < 20; i++) {
      updateBug(b, 1 / 60, settings, viewport, rng, c);
    }
    expect(Math.cos(b.heading)).toBeLessThan(0);
  });

  it("moves faster while fleeing", () => {
    const band = REPELLENT_RADIUS * 0.65;
    const far = bug({ x: 400, y: 300, heading: Math.PI / 2, stateTimer: 5 });
    const near = bug({
      x: 400,
      y: 300,
      heading: Math.PI / 2,
      stateTimer: 5,
      id: "bug-2",
    });
    const rng = new Rng(19);
    const rng2 = new Rng(19);
    const dt = 1 / 60;
    for (let i = 0; i < 12; i++) {
      updateBug(far, dt, { ...settings, repellent: false }, viewport, rng, cursor(700, 300));
      updateBug(near, dt, settings, viewport, rng2, cursor(400 + band, 300));
    }
    const farDist = Math.hypot(far.x - 400, far.y - 300);
    const nearDist = Math.hypot(near.x - 400, near.y - 300);
    expect(nearDist).toBeGreaterThan(farDist * REPELLENT_SPEED_MIN * 0.75);
  });

  it("wakes a paused bug when the cursor is in the flee band", () => {
    const dist = REPELLENT_RADIUS * 0.7;
    const b = bug({ x: 400, y: 300, state: "paused", stateTimer: 2, heading: 1 });
    const rng = new Rng(23);
    updateBug(b, 1 / 60, settings, viewport, rng, cursor(400 + dist, 300));
    expect(b.state).toBe("crawling");
  });

  it("keeps running inside the panic radius instead of freezing", () => {
    const b = bug({ x: 400, y: 300, heading: Math.PI, stateTimer: 5 });
    const rng = new Rng(41);
    const before = { x: b.x, y: b.y };
    const c = cursor(400 + REPELLENT_PANIC_RADIUS * 0.5, 300);
    for (let i = 0; i < 15; i++) {
      updateBug(b, 1 / 60, settings, viewport, rng, c);
    }
    const moved = Math.hypot(b.x - before.x, b.y - before.y);
    expect(moved).toBeGreaterThan(2);
    expect(b.state).toBe("crawling");
  });

  it("ignores cursor outside the window or when repellent is off", () => {
    const outside = bug({ x: 400, y: 300, heading: 0, stateTimer: 5 });
    const rng = new Rng(29);
    const beforeHeading = outside.heading;
    updateBug(outside, 1 / 60, settings, viewport, rng, cursor(430, 300, false));
    expect(Math.cos(outside.heading)).toBeGreaterThan(Math.cos(beforeHeading) - 0.2);

    const off = bug({ x: 400, y: 300, heading: 0, stateTimer: 5, id: "bug-off" });
    const rng2 = new Rng(31);
    updateBug(
      off,
      1 / 60,
      { ...settings, repellent: false },
      viewport,
      rng2,
      cursor(400 + REPELLENT_RADIUS * 0.5, 300),
    );
    expect(Math.cos(off.heading)).toBeGreaterThan(-0.3);
  });

  it("does not flee when the cursor is beyond the radius", () => {
    const b = bug({ x: 100, y: 100, heading: 0, stateTimer: 5 });
    const rng = new Rng(37);
    const farCursor = cursor(100 + REPELLENT_RADIUS + 30, 100);
    updateBug(b, 1 / 60, settings, viewport, rng, farCursor);
    expect(Math.cos(b.heading)).toBeGreaterThan(-0.3);
  });
});
