import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../core/config";

const native = vi.hoisted(() => ({
  capture: vi.fn(),
  compatibility: vi.fn(),
  hotkeys: vi.fn(),
  invoke: vi.fn(),
  emit: vi.fn(),
  listen: vi.fn(),
  loadStore: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
  isEnabled: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  setLocalePref: vi.fn(),
  syncTrayLocale: vi.fn(),
}));

vi.mock("../tauriBridge", () => ({
  setOverlayCaptureVisible: native.capture,
  setCaptureHotkeys: native.hotkeys,
  setCaptureCompatibilityEnabled: native.compatibility,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: native.emit, listen: native.listen }));
vi.mock("@tauri-apps/plugin-store", () => ({ Store: { load: native.loadStore } }));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: native.isEnabled,
  enable: native.enable,
  disable: native.disable,
}));
vi.mock("../../i18n", () => ({
  setLocalePref: native.setLocalePref,
  syncTrayLocale: native.syncTrayLocale,
}));

describe("persisted overlay capture settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    native.loadStore.mockResolvedValue({ get: native.get, set: native.set, save: native.save });
    native.get.mockResolvedValue(undefined);
    native.capture.mockResolvedValue(undefined);
    native.hotkeys.mockResolvedValue(undefined);
    native.isEnabled.mockResolvedValue(false);
    native.setLocalePref.mockReturnValue("en");
  });

  it("applies capture exclusion when loading a legacy settings file", async () => {
    native.get.mockResolvedValue({ count: 7, sound: false });
    const { loadSettings } = await import("../settingsService");

    const settings = await loadSettings();

    expect(settings.count).toBe(7);
    expect(settings.captureCompatibilityEnabled).toBe(false);
    expect(native.compatibility).toHaveBeenCalledWith(false);
    expect(settings.showInCaptures).toBe(false);
    expect(native.capture).toHaveBeenCalledWith(false);
  });

  it.each(["missing settings", "store load failure", "store read failure"])(
    "applies the default capture exclusion after %s",
    async (failure) => {
      if (failure === "store load failure") native.loadStore.mockRejectedValue(new Error("store unavailable"));
      if (failure === "store read failure") native.get.mockRejectedValue(new Error("store unreadable"));
      const { loadSettings } = await import("../settingsService");

      const settings = await loadSettings();

      expect(settings.showInCaptures).toBe(false);
      expect(native.capture).toHaveBeenCalledWith(false);
    },
  );

  it("restores an explicit capture opt-in before settings loading finishes", async () => {
    native.get.mockResolvedValue({ showInCaptures: true });
    let completeNativeUpdate!: () => void;
    native.capture.mockReturnValue(new Promise<void>((resolve) => { completeNativeUpdate = resolve; }));
    const { loadSettings } = await import("../settingsService");
    let finished = false;
    const loading = loadSettings().then((settings) => { finished = true; return settings; });
    await vi.waitFor(() => expect(native.capture).toHaveBeenCalledWith(true));

    expect(finished).toBe(false);
    completeNativeUpdate();
    expect((await loading).showInCaptures).toBe(true);
  });

  it("normalizes secondary-overlay settings without overriding the current native capture preference", async () => {
    native.get.mockResolvedValue({ showInCaptures: "true" });
    const { loadSettings } = await import("../settingsService");

    const settings = await loadSettings(false);

    expect(settings.showInCaptures).toBe(false);
    expect(native.capture).not.toHaveBeenCalled();
  });

  it("keeps loading the app when applying the initial capture preference fails", async () => {
    native.get.mockResolvedValue({ count: 8, showInCaptures: true });
    const failure = new Error("native capture unavailable");
    native.capture.mockRejectedValue(failure);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { loadSettings } = await import("../settingsService");

      const settings = await loadSettings();

      expect(settings.count).toBe(8);
      expect(settings.showInCaptures).toBe(true);
      expect(log).toHaveBeenCalledWith("apply capture preference failed", failure);
    } finally {
      log.mockRestore();
    }
  });

  it("updates native capture state from settings before saving or broadcasting, without an overlay listener", async () => {
    let completeNativeUpdate!: () => void;
    native.capture.mockReturnValue(new Promise<void>((resolve) => { completeNativeUpdate = resolve; }));
    const { saveSettings, SETTINGS_EVENT } = await import("../settingsService");
    const next = { ...DEFAULT_SETTINGS, showInCaptures: true };

    const saving = saveSettings(next);
    await vi.waitFor(() => expect(native.capture).toHaveBeenCalledWith(true));
    expect(native.set).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
    expect(native.emit).not.toHaveBeenCalled();
    expect(native.listen).not.toHaveBeenCalled();
    completeNativeUpdate();
    await saving;

    expect(native.hotkeys).toHaveBeenCalledWith(next.captureHotkeys);
    expect(native.set).toHaveBeenCalledWith("settings", next);
    expect(native.save).toHaveBeenCalledTimes(1);
    expect(native.emit).toHaveBeenCalledWith(SETTINGS_EVENT, next);
  });

  it("does not persist or broadcast success when native capture configuration fails", async () => {
    native.capture.mockRejectedValue(new Error("capture exclusion unavailable"));
    const { saveSettings } = await import("../settingsService");

    await expect(saveSettings({ ...DEFAULT_SETTINGS, showInCaptures: true })).rejects.toThrow("capture exclusion unavailable");

    expect(native.hotkeys).not.toHaveBeenCalled();
    expect(native.set).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
    expect(native.emit).not.toHaveBeenCalled();
    expect(native.syncTrayLocale).not.toHaveBeenCalled();
  });
});
