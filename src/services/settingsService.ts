import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Store } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { DEFAULT_SETTINGS } from "../core/config";
import { emptyDailyStats, normalizeDailyStats } from "../core/bugManager";
import { clampSettings } from "../core/settings";
import type { DailyStats, Settings } from "../core/types";
import { setLocalePref, syncTrayLocale } from "../i18n";
import { emitLocal, isTauri, listenLocal } from "../platform/desktop";
import { defaultStorage, loadJson, saveJson } from "../platform/webStorage";
import { setCaptureCompatibilityEnabled, setCaptureHotkeys, setOverlayCaptureVisible } from "./tauriBridge";

export { clampSettings };

export const SETTINGS_EVENT = "settings-changed";
export const COMMAND_EVENT = "overlay-command";
export const SETTINGS_STORE_FILE = "settings.json";

/** Web persistence keys (localStorage). Desktop keeps `settings.json`. */
export const WEB_SETTINGS_KEY = "bugscurry.settings";
export const WEB_DAILY_KEY = "bugscurry.dailyStats";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(SETTINGS_STORE_FILE);
  }
  return storePromise;
}

/** Resolve locale pref → zh-CN/en, update reactive locale, refresh tray labels. */
export async function applyUiLocale(pref: Settings["locale"]): Promise<void> {
  const locale = setLocalePref(pref);
  await syncTrayLocale(locale);
}

/** Apply theme to a document element (settings / popup windows). */
export function applyThemeToDocument(
  doc: Document,
  theme: Settings["theme"],
): void {
  const root = doc.documentElement;
  root.dataset.theme = theme;
  if (theme === "auto") {
    root.removeAttribute("data-theme");
    root.dataset.theme = "auto";
  }
}

export async function loadSettings(applyCapturePreference = true): Promise<Settings> {
  if (!isTauri()) {
    // Web demo: localStorage only; native capture/autostart do not exist.
    return clampSettings(loadJson(defaultStorage(), WEB_SETTINGS_KEY) ?? {});
  }
  let next = { ...DEFAULT_SETTINGS };
  try {
    const store = await getStore();
    const raw = await store.get<Partial<Settings>>("settings");
    next = clampSettings(raw ?? {});
    try {
      next.autostart = await isEnabled();
    } catch {
      // ignore
    }
  } catch {
    // A missing or unavailable store uses the same default capture preference.
  }
  if (applyCapturePreference) {
    try {
      await setOverlayCaptureVisible(next.showInCaptures);
    } catch (err) {
      // Capture exclusion is best effort; a native failure must not stop the app.
      console.error("apply capture preference failed", err);
    }
    try {
      await setCaptureHotkeys(next.captureHotkeys);
      await setCaptureCompatibilityEnabled(next.captureCompatibilityEnabled);
    } catch (err) {
      console.error("apply capture hotkeys failed", err);
    }
  }
  return next;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const next = clampSettings(settings);
  if (!isTauri()) {
    saveJson(defaultStorage(), WEB_SETTINGS_KEY, next);
    await applyUiLocale(next.locale);
    emitLocal(SETTINGS_EVENT, next);
    return;
  }
  // Apply from the saving UI even when hidden overlay WebViews are suspended.
  await setOverlayCaptureVisible(next.showInCaptures);
  await setCaptureHotkeys(next.captureHotkeys);
  await setCaptureCompatibilityEnabled(next.captureCompatibilityEnabled);
  try {
    const store = await getStore();
    await store.set("settings", next);
    await store.save();
  } catch (err) {
    console.error("save settings failed", err);
  }
  await applyUiLocale(next.locale);
  await emit(SETTINGS_EVENT, next);
}

const DAILY_KEY = "dailyStats";

export async function loadDailyStats(): Promise<DailyStats | null> {
  if (!isTauri()) {
    return normalizeDailyStats(loadJson(defaultStorage(), WEB_DAILY_KEY));
  }
  try {
    const store = await getStore();
    return normalizeDailyStats(await store.get(DAILY_KEY));
  } catch {
    return emptyDailyStats();
  }
}

export async function saveDailyStats(stats: DailyStats): Promise<void> {
  const next = normalizeDailyStats(stats);
  if (!isTauri()) {
    saveJson(defaultStorage(), WEB_DAILY_KEY, next);
    return;
  }
  const store = await getStore();
  await store.set(DAILY_KEY, next);
  await store.save();
}

export async function listenSettings(
  cb: (settings: Settings) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(listenLocal<Settings>(SETTINGS_EVENT, (payload) => cb(clampSettings(payload))));
  }
  return listen<Settings>(SETTINGS_EVENT, (e) => cb(clampSettings(e.payload)));
}

export type OverlayCommand =
  | "clear"
  | "regenerate"
  | "add_one"
  | "remove_one"
  | "toggle_visibility"
  /** Hidden settings debug panel */
  | "debug_rain_random"
  | "debug_rain_stop"
  | `debug_weather:${import("../core/types").RainKind}`
  | `debug_event:${import("../core/types").RandomEventKind}`
  | "debug_spray";

export async function sendOverlayCommand(cmd: OverlayCommand): Promise<void> {
  if (!isTauri()) {
    emitLocal(COMMAND_EVENT, cmd);
    return;
  }
  await emit(COMMAND_EVENT, cmd);
}

export async function listenOverlayCommands(
  cb: (cmd: string) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(listenLocal<string>(COMMAND_EVENT, (cmd) => cb(cmd)));
  }
  return listen<string>(COMMAND_EVENT, (e) => cb(e.payload));
}

export async function openSettingsWindow(): Promise<void> {
  // Web embeds settings as a drawer — there is no second window to open.
  if (!isTauri()) return;
  await invoke("open_settings_window");
}

export async function applyMonitorMode(mode: Settings["monitorMode"]): Promise<void> {
  // Single viewport on web; nothing to re-layout.
  if (!isTauri()) return;
  await invoke("apply_monitor_mode_cmd", { mode });
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return;
  if (on) await enable();
  else await disable();
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  await invoke("quit_app");
}
