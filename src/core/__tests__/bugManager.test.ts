import { describe, expect, it } from "vitest";
import { BugManager } from "../bugManager";
import { DEFAULT_SETTINGS, DEATH_FADE_DURATION, MAX_PARTICLES, MAX_STAINS, SQUISH_DURATION } from "../config";
import type { Bug, Settings, Viewport } from "../types";
import "../../species";

const viewport: Viewport = { width: 800, height: 600, dpr: 1 };

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, count: 3, ...overrides };
}

function finishDeath(manager: BugManager, bug: Bug): void {
  // Population tests finish death regardless of randomly assigned spawn HP.
  while (bug.hp > 1) manager.hit(bug);
  manager.squish(bug);
  manager.tick(SQUISH_DURATION + 0.01);
  manager.tick(DEATH_FADE_DURATION + 0.01);
}

describe("BugManager", () => {
  it("spawns the configured count", () => {
    const m = new BugManager(makeSettings({ count: 5 }), viewport);
    expect(m.list).toHaveLength(5);
  });

  it("does not auto-replace squished bugs", () => {
    const m = new BugManager(makeSettings({ count: 3 }), viewport);
    const target = m.list[0];
    finishDeath(m, target);
    expect(m.list).toHaveLength(2);
    m.tick(10);
    expect(m.list).toHaveLength(2);
  });

  it("only refills when count increases", () => {
    const m = new BugManager(makeSettings({ count: 3 }), viewport);
    finishDeath(m, m.list[0]);
    expect(m.list).toHaveLength(2);

    m.applySettings(makeSettings({ count: 4 }));
    expect(m.list).toHaveLength(4);
  });

  it("keeps population lower after squish when count is unchanged", () => {
    const m = new BugManager(makeSettings({ count: 3 }), viewport);
    finishDeath(m, m.list[0]);
    m.applySettings(makeSettings({ count: 3 }));
    expect(m.list).toHaveLength(2);
  });

  it("clear empties bugs and suppresses respawn until regenerate", () => {
    const m = new BugManager(makeSettings({ count: 3 }), viewport);
    m.clear();
    expect(m.list).toHaveLength(0);
    m.syncCount();
    expect(m.list).toHaveLength(0);
    m.regenerate();
    expect(m.list).toHaveLength(3);
  });

  it("addOne / removeOne change population", () => {
    const m = new BugManager(makeSettings({ count: 2 }), viewport);
    m.addOne();
    expect(m.list).toHaveLength(3);
    m.removeOne();
    expect(m.list).toHaveLength(2);
  });

  it("live-rescales existing bugs when size changes", () => {
    const m = new BugManager(makeSettings({ count: 2, size: 1 }), viewport);
    const before = m.list.map((b) => b.size);
    m.applySettings(makeSettings({ count: 2, size: 1.5 }));
    m.list.forEach((b, i) => {
      expect(b.size).toBeCloseTo(before[i] * 1.5, 5);
    });
  });

  it("species change regenerates the population", () => {
    const m = new BugManager(makeSettings({ count: 2, species: "cockroach" }), viewport);
    const firstIds = m.list.map((b) => b.id);
    m.applySettings(makeSettings({ count: 2, species: "ant" }));
    expect(m.list).toHaveLength(2);
    expect(m.list.every((b) => b.species === "ant")).toBe(true);
    expect(m.list.map((b) => b.id)).not.toEqual(firstIds);
  });

  it("caps stains and particles", () => {
    const m = new BugManager(makeSettings({ count: 10, stains: true, particles: true }), viewport);
    for (let i = 0; i < 8; i++) {
      m.regenerate();
      for (const b of [...m.list]) m.squish(b);
    }
    expect(m.stainList.length).toBeLessThanOrEqual(MAX_STAINS);
    expect(m.particleList.length).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it("rejects double-squish on the same bug", () => {
    const m = new BugManager(makeSettings({ count: 1 }), viewport);
    const b = m.list[0];
    // This case checks a normal bug; fat bugs intentionally survive a hit.
    b.hp = b.maxHp = 1;
    expect(m.squish(b)).toBe(true);
    expect(m.squish(b)).toBe(false);
  });
});
