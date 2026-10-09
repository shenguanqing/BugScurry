import { describe, expect, it } from "vitest";
import {
  BUILTIN_WALLPAPERS,
  getBuiltinWallpaper,
  groupBuiltins,
} from "../builtinWallpapers";

describe("built-in wallpaper catalog", () => {
  it("has unique ids and resolvable thumb/full urls", () => {
    const ids = BUILTIN_WALLPAPERS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of BUILTIN_WALLPAPERS) {
      if (w.fake) {
        expect(w.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        continue;
      }
      // Remote hotlinks or vendored public/ files (relative).
      expect(w.thumb.startsWith("https://") || w.thumb.startsWith("./")).toBe(true);
      expect(w.full.startsWith("https://") || w.full.startsWith("./")).toBe(true);
      expect(w.version.length).toBeGreaterThan(0);
    }
  });

  it("covers Windows and macOS with light/dark variants", () => {
    const platforms = new Set(BUILTIN_WALLPAPERS.map((w) => w.platform));
    expect(platforms).toEqual(new Set(["windows", "macos"]));
    const variants = new Set(BUILTIN_WALLPAPERS.map((w) => w.variant));
    expect(variants).toEqual(new Set(["light", "dark"]));
  });

  it("resolves ids and groups windows-first", () => {
    expect(getBuiltinWallpaper("win11-bloom-dark")?.full).toContain("wallpaperhub");
    expect(getBuiltinWallpaper("macos-tahoe-light")?.full).toContain("512pixels");
    expect(getBuiltinWallpaper(null)).toBeUndefined();
    expect(getBuiltinWallpaper("nope")).toBeUndefined();
    const groups = groupBuiltins();
    expect(groups.map((g) => g.platform)).toEqual(["windows", "macos"]);
    const win11 = groups[0].versions.find((v) => v.version === "Windows 11");
    expect(win11?.items.map((i) => i.variant).sort()).toEqual(["dark", "light"]);
    // Every grouped item renders exactly once.
    const flat = groups.flatMap((g) => g.versions.flatMap((v) => v.items));
    expect(flat).toHaveLength(BUILTIN_WALLPAPERS.length);
  });
});
