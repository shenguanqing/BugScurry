import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Store } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { DEFAULT_SETTINGS, LIMITS } from "../core/config";
import type { Settings } from "../core/types";

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

export function clampSettings(input: Partial<Settings>): Settings {
  const next: Settings = { ...DEFAULT_SETTINGS, ...input };
  next.count = Math.min(LIMITS.countMax, Math.max(LIMITS.countMin, Math.round(next.count)));
  next.size = Math.min(LIMITS.sizeMax, Math.max(LIMITS.sizeMin, next.size));
  next.speed = Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, next.speed));
  next.randomness = Math.min(
    LIMITS.randomnessMax,
    Math.max(LIMITS.randomnessMin, next.randomness),
  );
  next.sound = !!next.sound;
  next.stains = !!next.stains;
  next.particles = !!next.particles;
  next.autostart = !!next.autostart;
  next.monitorMode = next.monitorMode === "all" ? "all" : "primary";
  next.species = typeof next.species === "string" && next.species ? next.species : "random";
  return next;
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
  await emit(SETTINGS_EVENT, next);
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
