import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockWebRuntime } from "./runtimeEnv";
import { WEB_DAILY_KEY, WEB_SETTINGS_KEY } from "../settingsService";
import { DEFAULT_SETTINGS } from "../../core/config";

function memoryLocalStorage(): void {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  vi.stubGlobal("localStorage", storage);
}

describe("web settings persistence", () => {
  beforeEach(() => {
    mockWebRuntime();
    vi.resetModules();
    memoryLocalStorage();
    // Same-page bus needs a DOM-like window; node has none.
    const target = new EventTarget();
    vi.stubGlobal("window", {
      dispatchEvent: (e: Event) => target.dispatchEvent(e),
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    });
  });

  it("round-trips settings through localStorage without native calls", async () => {
    const { loadSettings, saveSettings } = await import("../settingsService");
    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS });
    await saveSettings({ ...DEFAULT_SETTINGS, count: 12, species: "ant" });
    const reloaded = await loadSettings();
    expect(reloaded.count).toBe(12);
    expect(reloaded.species).toBe("ant");
    expect(JSON.parse(localStorage.getItem(WEB_SETTINGS_KEY)!).count).toBe(12);
  });

  it("clamps corrupt payloads back to defaults", async () => {
    localStorage.setItem(WEB_SETTINGS_KEY, "{nope");
    const { loadSettings } = await import("../settingsService");
    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });

  it("round-trips daily stats through localStorage", async () => {
    const { loadDailyStats, saveDailyStats } = await import("../settingsService");
    expect(await loadDailyStats()).toEqual({ date: expect.any(String), kills: 0, bestCombo: 0 });
    await saveDailyStats({ date: "2026-10-09", kills: 5, bestCombo: 3 });
    expect(await loadDailyStats()).toEqual({ date: "2026-10-09", kills: 5, bestCombo: 3 });
    expect(JSON.parse(localStorage.getItem(WEB_DAILY_KEY)!).kills).toBe(5);
  });

  it("delivers settings and overlay commands on the same-page bus", async () => {
    const { listenSettings, saveSettings, listenOverlayCommands, sendOverlayCommand } =
      await import("../settingsService");
    const seen: unknown[] = [];
    const cmds: string[] = [];
    await listenSettings((s) => seen.push(s.count));
    await listenOverlayCommands((c) => cmds.push(c));
    await saveSettings({ ...DEFAULT_SETTINGS, count: 7 });
    await sendOverlayCommand("regenerate");
    expect(seen).toEqual([7]);
    expect(cmds).toEqual(["regenerate"]);
  });
});
