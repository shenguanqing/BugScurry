import { describe, expect, it } from "vitest";
import { HIT_RADIUS_CHASE, HIT_RADIUS_SCALE } from "../config";
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
    personality: "curious",
    eatingBaitId: null,
    enjoyingFood: false,
    foodCooldown: 0,
    satisfiedTimer: 0,
    carryKind: null,
    carryTimer: 0,
    hp: 1,
    maxHp: 1,
    hurtTimer: 0,
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

  it("uses a wider chase radius when the click is already close", () => {
    const b = bug({ size: 12 });
    const chaseR = 12 * HIT_RADIUS_CHASE;
    const baseR = 12 * HIT_RADIUS_SCALE;
    // Between base and chase: still a hit because the cursor is close.
    const mid = 100 + (baseR + chaseR) / 2;
    expect(mid - 100).toBeGreaterThan(baseR);
    expect(mid - 100).toBeLessThanOrEqual(chaseR);
    expect(hitTestBug([b], mid, 100, viewport)).toBe(b);
  });
});
