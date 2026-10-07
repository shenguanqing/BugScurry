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

  it("coerces the rain flag and defaults it off", () => {
    expect(clampSettings({}).rain).toBe(false);
    expect(clampSettings({ rain: 1 as unknown as boolean }).rain).toBe(true);
    expect(clampSettings({ rain: false }).rain).toBe(false);
  });

  it("coerces autoRain and defaults it off", () => {
    expect(clampSettings({}).autoRain).toBe(false);
    expect(clampSettings({ autoRain: 1 as unknown as boolean }).autoRain).toBe(true);
    expect(clampSettings({ autoRain: false }).autoRain).toBe(false);
  });

  it("defaults capture visibility off for legacy settings and honors explicit opt-in", () => {
    expect(DEFAULT_SETTINGS.showInCaptures).toBe(false);
    expect(clampSettings({ count: 12 }).showInCaptures).toBe(false);
    expect(clampSettings({ showInCaptures: true }).showInCaptures).toBe(true);
    expect(clampSettings({ showInCaptures: false }).showInCaptures).toBe(false);
  });

  it.each([undefined, null, 0, 1, "true", "false", {}, []])(
    "requires literal true to show overlays in captures (invalid value: %j)",
    (value) => {
      expect(clampSettings({ showInCaptures: value as boolean }).showInCaptures).toBe(false);
    },
  );

  it("requires explicit capture compatibility opt-in, including legacy settings", () => {
    expect(clampSettings({}).captureCompatibilityEnabled).toBe(false);
    expect(clampSettings({ captureCompatibilityEnabled: true }).captureCompatibilityEnabled).toBe(true);
    expect(clampSettings({ captureCompatibilityEnabled: "true" as unknown as boolean }).captureCompatibilityEnabled).toBe(false);
  });

  it("sanitizes custom capture hotkeys", () => {
    const defaults = DEFAULT_SETTINGS.captureHotkeys;
    expect(defaults).toEqual([
      { name: "snipaste", mods: "fn", code: "F1" },
      { name: "wechat", mods: "cmd+ctrl", code: "KeyA" },
    ]);
    expect(clampSettings({}).captureHotkeys).toEqual(defaults);
    const sanitized = clampSettings({
      captureHotkeys: [
        { mods: "cmd+ctrl", code: "KeyA" },
        { mods: "weird+ctrl", code: "KeyA" },
        { mods: "ctrl", code: "" },
        { mods: "cmd", code: "KeyS" },
        null as unknown as { mods: string; code: string },
        { mods: "cmd+ctrl", code: "KeyA" },
      ],
    }).captureHotkeys;
    expect(sanitized).toEqual([
      { mods: "cmd+ctrl", code: "KeyA" },
      { mods: "cmd", code: "KeyS" },
    ]);
    expect(clampSettings({ captureHotkeys: "cmd+a" as unknown as Settings["captureHotkeys"] }).captureHotkeys).toEqual([]);
  });

  it("normalizes rain kind and wind", () => {
    expect(clampSettings({}).rainKind).toBe("moderate");
    expect(clampSettings({ rainKind: "thunder" }).rainKind).toBe("thunder");
    expect(clampSettings({ rainKind: "hurricane" as never }).rainKind).toBe("moderate");
    expect(clampSettings({ rainWind: 9 }).rainWind).toBe(1);
    expect(clampSettings({ rainWind: -4 }).rainWind).toBe(-1);
    expect(clampSettings({ rainWind: Number.NaN }).rainWind).toBe(0);
  });
});
