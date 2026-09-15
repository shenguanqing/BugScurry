import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LIMITS } from "../config";
import { clampSettings } from "../settings";
import type { Settings } from "../types";

describe("clampSettings", () => {
  it("fills defaults for empty input", () => {
    expect(clampSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps count / size / speed / randomness into limits", () => {
    const s = clampSettings({
      count: 999,
      size: 0.1,
      speed: 99,
      randomness: -1,
    });
    expect(s.count).toBe(LIMITS.countMax);
    expect(s.size).toBe(LIMITS.sizeMin);
    expect(s.speed).toBe(LIMITS.speedMax);
    expect(s.randomness).toBe(LIMITS.randomnessMin);
  });

  it("rounds count and keeps valid enums", () => {
    const s = clampSettings({
      count: 3.6,
      monitorMode: "all",
      theme: "dark",
      locale: "en",
      species: "fly",
    });
    expect(s.count).toBe(4);
    expect(s.monitorMode).toBe("all");
    expect(s.theme).toBe("dark");
    expect(s.locale).toBe("en");
    expect(s.species).toBe("fly");
  });

  it("falls back on invalid enums", () => {
    const s = clampSettings({
      monitorMode: "nope" as Settings["monitorMode"],
      theme: "neon" as Settings["theme"],
      locale: "fr" as Settings["locale"],
      species: "",
    });
    expect(s.monitorMode).toBe("primary");
    expect(s.theme).toBe("auto");
    expect(s.locale).toBe("auto");
    expect(s.species).toBe("random");
  });

  it("coerces flags to booleans", () => {
    const s = clampSettings({
      sound: 1 as unknown as boolean,
      stains: 0 as unknown as boolean,
      particles: undefined,
    });
    expect(s.sound).toBe(true);
    expect(s.stains).toBe(false);
    expect(typeof s.particles).toBe("boolean");
  });

  it("defaults repellent on, honors explicit false", () => {
    expect(clampSettings({}).repellent).toBe(true);
    const s = clampSettings({ repellent: false });
    expect(s.repellent).toBe(false);
  });
});
