import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, EDGE_MARGIN } from "../config";
import { updateBug } from "../movement";
import { Rng } from "../rng";
import type { Bug, Settings, Viewport } from "../types";

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
    ...overrides,
  };
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
    // Escape aims into free quadrant (down-right from top-left).
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
    // Near left wall: target heading is +Y (π/2). Should not keep pointing left forever.
    const leftish = Math.cos(b.heading) < -0.9;
    expect(leftish).toBe(false);
    expect(b.x).toBeGreaterThanOrEqual(EDGE_MARGIN * 0.5);
  });
});
