import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Store } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { DEFAULT_SETTINGS } from "../core/config";
import { emptyDailyStats, normalizeDailyStats } from "../core/bugManager";
import { clampSettings } from "../core/settings";
import type { DailyStats, Settings } from "../core/types";
import { setLocalePref, syncTrayLocale } from "../i18n";

export { clampSettings };

export const SETTINGS_EVENT = "settings-changed";
export const COMMAND_EVENT = "overlay-command";
export const SETTINGS_STORE_FILE = "settings.json";

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

export async function loadSettings(): Promise<Settings> {
  try {
    const store = await getStore();
    const raw = await store.get<Partial<Settings>>("settings");
    let next = clampSettings(raw ?? {});
    try {
      next.autostart = await isEnabled();
    } catch {
      // ignore
    }
    return next;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const next = clampSettings(settings);
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
  try {
    const store = await getStore();
    return normalizeDailyStats(await store.get(DAILY_KEY));
  } catch {
    return emptyDailyStats();
  }
}

export async function saveDailyStats(stats: DailyStats): Promise<void> {
  const store = await getStore();
  await store.set(DAILY_KEY, normalizeDailyStats(stats));
  await store.save();
}

export async function listenSettings(
  cb: (settings: Settings) => void,
): Promise<UnlistenFn> {
  return listen<Settings>(SETTINGS_EVENT, (e) => cb(clampSettings(e.payload)));
}

export async function sendOverlayCommand(
  cmd: "clear" | "regenerate" | "add_one" | "remove_one" | "toggle_visibility",
): Promise<void> {
  await emit(COMMAND_EVENT, cmd);
}

export async function listenOverlayCommands(
  cb: (cmd: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(COMMAND_EVENT, (e) => cb(e.payload));
}

export async function openSettingsWindow(): Promise<void> {
  await invoke("open_settings_window");
}

export async function applyMonitorMode(mode: Settings["monitorMode"]): Promise<void> {
  await invoke("apply_monitor_mode_cmd", { mode });
}

export async function setAutostart(on: boolean): Promise<void> {
  if (on) await enable();
  else await disable();
}

export async function quitApp(): Promise<void> {
  await invoke("quit_app");
}
