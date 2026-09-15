import { describe, expect, it } from "vitest";
import { BugManager } from "../bugManager";
import { BAIT_ATTRACT_RADIUS, BAIT_LIFE, DEFAULT_SETTINGS } from "../config";
import { updateBug } from "../movement";
import { Rng } from "../rng";
import type { Bug, Settings, Viewport } from "../types";

const viewport: Viewport = { width: 800, height: 600, dpr: 1 };
const settings: Settings = { ...DEFAULT_SETTINGS, count: 3, speed: 1, randomness: 0.5 };

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

describe("bait", () => {
  it("dropBait creates a crumb inside the viewport", () => {
    const m = new BugManager(settings, viewport);
    const bait = m.dropBait();
    expect(m.baitList).toHaveLength(1);
    expect(bait.x).toBeGreaterThan(0);
    expect(bait.x).toBeLessThan(viewport.width);
    expect(bait.life).toBeCloseTo(BAIT_LIFE);
    expect(m.activeBait?.id).toBe(bait.id);
  });

  it("bugs steer toward a nearby crumb", () => {
    const b = bug({ x: 200, y: 300, heading: 0, stateTimer: 5 });
    const bait = {
      id: "bait-1",
      x: 200 + BAIT_ATTRACT_RADIUS * 0.5,
      y: 300,
      size: 6,
      life: 5,
      maxLife: BAIT_LIFE,
    };
    const rng = new Rng(13);
    for (let i = 0; i < 30; i++) {
      updateBug(b, 1 / 60, settings, viewport, rng, null, bait);
    }
    expect(b.x).toBeGreaterThan(200);
  });

  it("bugs pause to nibble on the crumb", () => {
    const b = bug({ x: 200, y: 300, heading: 0, stateTimer: 5 });
    const bait = {
      id: "bait-2",
      x: 205,
      y: 300,
      size: 6,
      life: 5,
      maxLife: BAIT_LIFE,
    };
    updateBug(b, 1 / 60, settings, viewport, new Rng(15), null, bait);
    expect(b.state).toBe("paused");
  });

  it("bait expires and is removed", () => {
    const m = new BugManager(settings, viewport);
    m.dropBait();
    expect(m.baitList).toHaveLength(1);
    for (let i = 0; i < 20; i++) m.tick(1);
    expect(m.baitList).toHaveLength(0);
  });
});
