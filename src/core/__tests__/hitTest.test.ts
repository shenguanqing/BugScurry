import { describe, expect, it } from "vitest";
import { hitTestBug } from "../hitTest";
import type { Bug, Viewport } from "../types";

const viewport: Viewport = { width: 800, height: 600, dpr: 2 };

function bug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: "bug-1",
    species: "cockroach",
    x: 100,
    y: 100,
    heading: 0,
    speed: 70,
    size: 15,
    state: "crawling",
    legPhase: 0,
    stateTimer: 1,
    deathProgress: 0,
    turnBias: 0,
    edgeAffinity: 0.5,
    stuckTime: 0,
    seed: 0.5,
    ...overrides,
  };
}

describe("hitTestBug", () => {
  it("hits inside the radius", () => {
    const b = bug();
    expect(hitTestBug([b], 105, 100, viewport)).toBe(b);
  });

  it("misses outside the radius", () => {
    const b = bug();
    expect(hitTestBug([b], 200, 200, viewport)).toBeNull();
  });

  it("returns the topmost (last) overlapping bug", () => {
    const under = bug({ id: "under" });
    const over = bug({ id: "over" });
    expect(hitTestBug([under, over], 100, 100, viewport)).toBe(over);
  });

  it("ignores squishing and dying bugs", () => {
    const dying = bug({ id: "dying", state: "dying" });
    const squishing = bug({ id: "squishing", state: "squishing" });
    expect(hitTestBug([dying, squishing], 100, 100, viewport)).toBeNull();
  });
});
