import { describe, expect, it } from "vitest";
import { BugManager } from "../bugManager";
import { DEFAULT_SETTINGS, LIMITS, PRANK } from "../config";
import { Rng } from "../rng";
import type { Settings, Viewport } from "../types";
import { getSpecies } from "../../species";

function makeSettings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, count: 5, particles: true, stains: true, ...patch };
}

function makeManager(settings = makeSettings()): BugManager {
  const viewport: Viewport = { width: 800, height: 600, dpr: 1 };
  return new BugManager(settings, viewport);
}

describe("prank spray", () => {
  it("kills every live bug on the screen and records kills", () => {
    const manager = makeManager(makeSettings({ count: 8 }));
    expect(manager.list).toHaveLength(8);
    const results = manager.sprayKillAll(1_000);
    expect(results).toHaveLength(8);
    expect(manager.dailyStats.kills).toBe(8);
    for (const bug of manager.list) {
      expect(bug.state === "squishing" || bug.state === "dying").toBe(true);
    }
    expect(manager.sprayFxProgress).toBeGreaterThan(0);
  });

  it("finishes fat bugs in one spray without extra combo credit", () => {
    const manager = makeManager(makeSettings({ count: 1 }));
    const bug = manager.list[0];
    bug.hp = 3;
    bug.maxHp = 3;
    const results = manager.sprayKillAll(2_000);
    expect(results).toHaveLength(1);
    expect(manager.dailyStats.kills).toBe(1);
    expect(manager.currentCombo).toBe(1);
    expect(bug.state === "squishing" || bug.state === "dying").toBe(true);
  });
});

describe("prank swarm", () => {
  it("boosts toward the formula target and never exceeds the hard cap", () => {
    const manager = makeManager(makeSettings({ count: 40 }));
    const target = manager.startSwarm(0);
    expect(target).toBe(Math.min(LIMITS.countMax, Math.max(40 + PRANK.swarmBonus, 40 * PRANK.swarmMul)));
    expect(target).toBe(LIMITS.countMax);
    expect(manager.list).toHaveLength(LIMITS.countMax);
    expect(manager.isSwarmActive).toBe(true);
  });

  it("falls back to settings.count after peak+fall without rewriting settings", () => {
    const settings = makeSettings({ count: 4 });
    const manager = makeManager(settings);
    manager.startSwarm(0);
    expect(manager.list.length).toBeGreaterThan(4);

    const afterPeak = (PRANK.swarmPeakSec + PRANK.swarmFallSec / 2) * 1000;
    manager.tick(0.016, afterPeak);
    expect(manager.list.length).toBeGreaterThanOrEqual(4);
    expect(manager.list.length).toBeLessThan(Math.max(4 + PRANK.swarmBonus, 4 * PRANK.swarmMul));

    const done = (PRANK.swarmPeakSec + PRANK.swarmFallSec) * 1000 + 20;
    manager.tick(0.016, done);
    expect(manager.isSwarmActive).toBe(false);
    expect(manager.list).toHaveLength(4);
    expect(settings.count).toBe(4);
  });

  it("does not collapse the storm on an unrelated settings apply", () => {
    const manager = makeManager(makeSettings({ count: 3 }));
    manager.startSwarm(0);
    const peak = manager.list.length;
    manager.applySettings({ ...makeSettings({ count: 3 }), size: 1.2 });
    expect(manager.list).toHaveLength(peak);
  });

  it("ends the storm when the user changes count", () => {
    const manager = makeManager(makeSettings({ count: 3 }));
    manager.startSwarm(0);
    manager.applySettings({ ...makeSettings({ count: 6 }) });
    expect(manager.isSwarmActive).toBe(false);
    expect(manager.list).toHaveLength(6);
  });

  it("addOne cancels the storm and sticks to the user count", () => {
    const manager = makeManager(makeSettings({ count: 3 }));
    manager.startSwarm(0);
    manager.addOne();
    expect(manager.isSwarmActive).toBe(false);
    expect(manager.list).toHaveLength(4);
  });
});

describe("random event kinds", () => {
  it("fat invasion drops 5–7 chonky invaders without rewriting settings.count", () => {
    const settings = makeSettings({ count: 3 });
    const manager = makeManager(settings);
    const n = manager.startFatInvasion();
    expect(n).toBeGreaterThanOrEqual(PRANK.fatInvasionMin);
    expect(n).toBeLessThanOrEqual(PRANK.fatInvasionMax);
    expect(manager.list).toHaveLength(3 + n);
    expect(settings.count).toBe(3);
    const extras = manager.list.slice(3);
    for (const bug of extras) {
      expect(bug.maxHp).toBe(3);
      expect(bug.hp).toBe(3);
    }
  });

  it("night raid only spawns nocturnal species", () => {
    const manager = makeManager(makeSettings({ count: 2 }));
    const n = manager.startNightRaid();
    expect(n).toBeGreaterThanOrEqual(PRANK.nightRaidMin);
    expect(n).toBeLessThanOrEqual(PRANK.nightRaidMax);
    const invaders = manager.list.slice(2);
    expect(invaders).toHaveLength(n);
    for (const bug of invaders) {
      expect(getSpecies(bug.species)?.traits.activity).toBe("nocturnal");
    }
  });

  it("berserk multiplies speed and restores after the window", () => {
    const manager = makeManager(makeSettings({ count: 4 }));
    const before = manager.list.map((b) => b.speed);
    manager.startBerserk(0);
    manager.list.forEach((bug, i) => {
      expect(bug.speed).toBeCloseTo(before[i] * PRANK.berserkMul, 5);
    });
    manager.tick(0.016, PRANK.berserkSec * 1000 + 10);
    manager.list.forEach((bug, i) => {
      expect(bug.speed).toBeCloseTo(before[i], 5);
    });
  });

  it("size chaos rescales bodies and restores originals", () => {
    const manager = makeManager(makeSettings({ count: 5 }));
    const before = manager.list.map((b) => b.size);
    manager.startSizeChaos(0, new Rng(7));
    manager.list.forEach((bug, i) => {
      expect(bug.size).not.toBe(before[i]);
    });
    manager.tick(0.016, PRANK.sizeChaosSec * 1000 + 10);
    manager.list.forEach((bug, i) => {
      expect(bug.size).toBe(before[i]);
    });
  });
});
