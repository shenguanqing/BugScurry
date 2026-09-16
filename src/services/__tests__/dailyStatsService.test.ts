import { describe, expect, it, vi } from "vitest";
import { emptyDailyStats } from "../../core/bugManager";
import { createDailyStatsService } from "../dailyStatsService";
import type { DailyStats } from "../../core/types";

describe("daily stats owner", () => {
  it("aggregates reports from multiple displays and saves the final rapid kill", async () => {
    const initial = { ...emptyDailyStats(), kills: 10, bestCombo: 2 };
    const saved: DailyStats[] = [];
    const publish = vi.fn(async () => {});
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => { release = resolve; });
    const save = vi.fn(async (stats: DailyStats) => {
      if (saved.length === 0) await firstWrite;
      saved.push(stats);
    });
    const owner = createDailyStatsService(initial, save, publish);
    const primary = owner.record({ date: initial.date, combo: 3 });
    const secondary = owner.record({ date: initial.date, combo: 1 });
    const last = owner.record({ date: initial.date, combo: 4 });
    await Promise.resolve();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([primary, secondary, last]);
    expect(saved.map((s) => s.kills)).toEqual([11, 12, 13]);
    expect(saved.at(-1)).toEqual({ ...initial, kills: 13, bestCombo: 4 });
    expect(publish).toHaveBeenLastCalledWith(saved.at(-1));
  });

  it("recovers after a failed save without losing the previous kill", async () => {
    const initial = emptyDailyStats();
    const save = vi.fn().mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValue(undefined);
    const owner = createDailyStatsService(initial, save, async () => {});
    await expect(owner.record({ date: initial.date, combo: 1 })).rejects.toThrow("disk unavailable");
    await owner.record({ date: initial.date, combo: 2 });
    expect(save).toHaveBeenLastCalledWith({ ...initial, kills: 2, bestCombo: 2 });
  });

  it("resets stale totals and ignores reports from a previous day", async () => {
    const save = vi.fn(async () => {});
    const owner = createDailyStatsService({ date: "2000-01-01", kills: 90, bestCombo: 9 }, save, async () => {});
    await owner.record({ date: "2000-01-01", combo: 9 });
    expect(save).not.toHaveBeenCalled();
    const today = emptyDailyStats();
    await owner.record({ date: today.date, combo: 1 });
    expect(save).toHaveBeenLastCalledWith({ ...today, kills: 1, bestCombo: 1 });
  });
});
