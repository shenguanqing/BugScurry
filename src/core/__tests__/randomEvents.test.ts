import { describe, expect, it } from "vitest";
import { RANDOM_EVENT_GAP_SEC } from "../config";
import {
  createAutoEventClock,
  eventBusyMs,
  nextEventGapMs,
  RANDOM_EVENT_KINDS,
  rearmAfterEvent,
  resetAutoEventClock,
  rollRandomEvent,
  tickAutoEvent,
} from "../randomEvents";
import type { RandomEventKind } from "../types";

describe("random event clock", () => {
  it("fires only after the due time", () => {
    const clock = createAutoEventClock(0, () => 0);
    // rng=0 → min gap
    expect(clock.dueAtMs).toBe(RANDOM_EVENT_GAP_SEC.min * 1000);
    expect(tickAutoEvent(clock, 0)).toBe(false);
    expect(tickAutoEvent(clock, RANDOM_EVENT_GAP_SEC.min * 1000)).toBe(true);
  });

  it("re-arms after an event including the busy window", () => {
    const clock = { dueAtMs: 0 };
    rearmAfterEvent(clock, 1_000, 30_000, () => 0);
    expect(clock.dueAtMs).toBe(1_000 + 30_000 + RANDOM_EVENT_GAP_SEC.min * 1000);
  });

  it("reset restarts a fresh gap from now", () => {
    const clock = { dueAtMs: 999_999 };
    resetAutoEventClock(clock, 5_000, () => 1);
    expect(clock.dueAtMs).toBe(5_000 + RANDOM_EVENT_GAP_SEC.max * 1000);
  });

  it("gap stays inside the configured range", () => {
    for (const r of [0, 0.5, 1]) {
      const ms = nextEventGapMs(() => r);
      expect(ms).toBeGreaterThanOrEqual(RANDOM_EVENT_GAP_SEC.min * 1000);
      expect(ms).toBeLessThanOrEqual(RANDOM_EVENT_GAP_SEC.max * 1000);
    }
  });

  it("rolls only known event kinds", () => {
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      const kind = rollRandomEvent(() => r);
      expect(RANDOM_EVENT_KINDS).toContain(kind);
    }
  });

  it("busy windows are non-zero for timed events", () => {
    expect(eventBusyMs("swarm")).toBeGreaterThan(0);
    expect(eventBusyMs("berserk")).toBeGreaterThan(0);
    expect(eventBusyMs("size_chaos")).toBeGreaterThan(0);
    expect(eventBusyMs("fat_invasion")).toBe(0);
    expect(eventBusyMs("night_raid")).toBe(0);
    const kinds: RandomEventKind[] = [...RANDOM_EVENT_KINDS];
    expect(kinds).toHaveLength(5);
  });
});
