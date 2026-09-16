import { normalizeDailyStats } from "../core/bugManager";
import type { DailyStats } from "../core/types";

export interface KillReport {
  date: string;
  combo: number;
}

/** One primary-window owner; every kill is queued for persistence. */
export function createDailyStatsService(
  initial: DailyStats,
  save: (stats: DailyStats) => Promise<void>,
  publish: (stats: DailyStats) => Promise<void>,
) {
  let stats = normalizeDailyStats(initial);
  let pending = Promise.resolve();

  return {
    record(report: KillReport): Promise<void> {
      stats = normalizeDailyStats(stats);
      if (report.date !== stats.date || !Number.isFinite(report.combo) || report.combo < 1) {
        return Promise.resolve();
      }
      stats = {
        ...stats,
        kills: stats.kills + 1,
        bestCombo: Math.max(stats.bestCombo, Math.floor(report.combo)),
      };
      const snapshot = { ...stats };
      // A failed write must not prevent later reports from being saved.
      pending = pending.catch(() => {}).then(async () => {
        await save(snapshot);
        await publish(snapshot);
      });
      return pending;
    },
    refresh(): Promise<void> {
      return publish(normalizeDailyStats(stats));
    },
  };
}
