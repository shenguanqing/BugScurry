import { describe, expect, it } from "vitest";
import { DEATH_FADE_DURATION, SQUISH_DURATION } from "../config";
import { isBugDead, startSquish, squishPressure, updateSquish } from "../squish";
import type { Bug } from "../types";

function bug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: "bug-1",
    species: "cockroach",
    x: 10,
    y: 10,
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

describe("squish", () => {
  it("startSquish only affects live bugs", () => {
    const live = bug();
    startSquish(live);
    expect(live.state).toBe("squishing");
    expect(live.stateTimer).toBeCloseTo(SQUISH_DURATION);

    const already = bug({ state: "dying", stateTimer: 0.5, deathProgress: 0.2 });
    startSquish(already);
    expect(already.state).toBe("dying");
    expect(already.stateTimer).toBe(0.5);
  });

  it("progresses squishing → dying → dead", () => {
    const b = bug();
    startSquish(b);

    updateSquish(b, SQUISH_DURATION);
    expect(b.state).toBe("dying");
    expect(b.stateTimer).toBeCloseTo(DEATH_FADE_DURATION);
    expect(isBugDead(b)).toBe(false);

    updateSquish(b, DEATH_FADE_DURATION);
    expect(b.deathProgress).toBeGreaterThanOrEqual(1);
    expect(isBugDead(b)).toBe(true);
  });

  it("pressure ramps while squishing and stays at 1 while dying", () => {
    expect(squishPressure(bug())).toBe(0);
    expect(squishPressure(bug({ state: "dying", deathProgress: 0.4 }))).toBe(1);

    const b = bug({ state: "squishing", deathProgress: 0 });
    expect(squishPressure(b)).toBeCloseTo(0);
    const mid = bug({ state: "squishing", deathProgress: 0.38 });
    expect(squishPressure(mid)).toBeCloseTo(1);
  });
});
