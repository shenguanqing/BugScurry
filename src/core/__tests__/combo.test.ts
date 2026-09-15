import { describe, expect, it } from "vitest";
import { BugManager, emptyDailyStats, normalizeDailyStats } from "../bugManager";
import { createBug } from "../bug";
import {
  COMBO_WINDOW,
  DEFAULT_SETTINGS,
  FAT_BUG_HP,
  FAT_BUG_SIZE_MIN,
} from "../config";
import { Rng } from "../rng";
import type { Bug, Settings, Viewport } from "../types";

const viewport: Viewport = { width: 800, height: 600, dpr: 1 };
const settings: Settings = { ...DEFAULT_SETTINGS, count: 5, species: "cockroach" };

function mkBug(overrides: Partial<Bug> = {}): Bug {
  const b = createBug(viewport, settings, new Rng(1));
  return { ...b, x: 400, y: 300, hp: 1, maxHp: 1, ...overrides };
}

describe("combo", () => {
  it("chains kills inside the window and resets after", () => {
    const m = new BugManager(settings, viewport);
    const t0 = 1000;
    const a = mkBug();
    m.list[0] = a;
    const r1 = m.hit(a, t0);
    expect(r1.kind).toBe("killed");
    if (r1.kind === "killed") expect(r1.combo).toBe(1);

    const b = mkBug({ id: "bug-2" });
    m.list[1] = b;
    const r2 = m.hit(b, t0 + 500);
    expect(r2.kind).toBe("killed");
    if (r2.kind === "killed") expect(r2.combo).toBe(2);

    const c = mkBug({ id: "bug-3" });
    m.list[2] = c;
    const r3 = m.hit(c, t0 + 500 + COMBO_WINDOW * 1000 + 50);
    expect(r3.kind).toBe("killed");
    if (r3.kind === "killed") expect(r3.combo).toBe(1);
  });

  it("tracks daily kills and best combo", () => {
    const m = new BugManager(settings, viewport, emptyDailyStats());
    let t = 0;
    for (let i = 0; i < 3; i++) {
      const target = mkBug({ id: `k-${i}` });
      m.list[i] = target;
      const r = m.hit(target, t);
      expect(r.kind).toBe("killed");
      t += 200;
    }
    const s = m.dailyStats;
    expect(s.kills).toBe(3);
    expect(s.bestCombo).toBe(3);
  });

  it("normalizeDailyStats rolls over a new day", () => {
    const stale = { date: "2000-01-01", kills: 99, bestCombo: 12 };
    const n = normalizeDailyStats(stale);
    expect(n.kills).toBe(0);
    expect(n.bestCombo).toBe(0);
  });
});

describe("fat bug", () => {
  it("takes 3 hits and only the last kills", () => {
    const m = new BugManager(settings, viewport);
    const fat = mkBug({ hp: FAT_BUG_HP, maxHp: FAT_BUG_HP });
    m.list[0] = fat;

    const r1 = m.hit(fat, 0);
    expect(r1.kind).toBe("hurt");
    expect(fat.hp).toBe(2);
    expect(fat.state).toBe("crawling");

    const r2 = m.hit(fat, 100);
    expect(r2.kind).toBe("hurt");
    expect(fat.hp).toBe(1);

    const r3 = m.hit(fat, 200);
    expect(r3.kind).toBe("killed");
    if (r3.kind === "killed") expect(r3.fat).toBe(true);
    expect(fat.state).toBe("squishing");
  });

  it("spawns with larger size and 3 hp when fat", () => {
    let fat: Bug | null = null;
    for (let i = 0; i < 400 && !fat; i++) {
      const b = createBug(viewport, settings, new Rng(i + 40));
      if (b.maxHp === FAT_BUG_HP) fat = b;
    }
    expect(fat).not.toBeNull();
    expect(fat!.size).toBeGreaterThanOrEqual(15 * FAT_BUG_SIZE_MIN * 0.9);
    expect(fat!.speed).toBeLessThan(70);
  });

  it("normal bugs die in one hit", () => {
    const m = new BugManager(settings, viewport);
    const b = mkBug({ hp: 1, maxHp: 1 });
    const r = m.hit(b, 0);
    expect(r.kind).toBe("killed");
  });
});
