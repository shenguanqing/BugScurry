import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { KillReport } from "./dailyStatsService";
import type { RandomEventKind, TrayCommand } from "../core/types";

/** Cursor in this overlay window's local logical CSS pixels. */
export interface CursorLocal {
  x: number;
  y: number;
  inside: boolean;
}

export async function setOverlayClickable(clickable: boolean): Promise<void> {
  await invoke("set_overlay_clickable", { clickable });
}

/** Request capture inclusion/exclusion for every native overlay window. */
export async function setOverlayCaptureVisible(visible: boolean): Promise<void> {
  await invoke("set_overlay_capture_visible", { visible });
}

/** Enable detection only after an explicit application preference. */
export async function setCaptureCompatibilityEnabled(enabled: boolean): Promise<void> {
  await invoke("set_capture_compatibility_enabled", { enabled });
}

/** macOS screenshot-session listener state for the settings compatibility hint. */
export interface CaptureMonitorStatus {
  /** Whether this platform implements screenshot-session detection at all. */
  supported: boolean;
  /** macOS "Input Monitoring" permission is granted. */
  authorized: boolean;
  /** The event tap is up. */
  listening: boolean;
  /** macOS Accessibility trust — needed to swallow keys while recording. */
  accessibility: boolean;
  /** An active tap is installed and can consume the recorded shortcut. */
  canRecord: boolean;
}

export async function getCaptureMonitorStatus(): Promise<CaptureMonitorStatus> {
  return invoke<CaptureMonitorStatus>("get_capture_monitor_status");
}

/** Start/retry detection; request Input Monitoring if neither permission path is authorized. */
export async function requestCaptureInputMonitoring(): Promise<CaptureMonitorStatus> {
  return invoke<CaptureMonitorStatus>("request_capture_input_monitoring");
}

/** `KeyboardEvent.code` → macOS virtual keycode (the hotkey recorder side). */
const KEYBOARD_CODE_TO_KEYCODE: Record<string, number> = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05,
  KeyZ: 0x06, KeyX: 0x07, KeyC: 0x08, KeyV: 0x09, KeyB: 0x0b, KeyQ: 0x0c,
  KeyW: 0x0d, KeyE: 0x0e, KeyR: 0x0f, KeyY: 0x10, KeyT: 0x11, KeyO: 0x1f,
  KeyU: 0x20, KeyI: 0x22, KeyP: 0x23, KeyL: 0x25, KeyJ: 0x26, KeyK: 0x28,
  KeyN: 0x2d, KeyM: 0x2e,
  Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit5: 0x17,
  Digit6: 0x16, Digit7: 0x1a, Digit8: 0x1c, Digit9: 0x19, Digit0: 0x1d,
  Minus: 0x1b, Equal: 0x18, BracketLeft: 0x21, BracketRight: 0x1e,
  Semicolon: 0x29, Quote: 0x27, Comma: 0x2b, Period: 0x2f, Slash: 0x2c,
  Backslash: 0x2a,
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61, F7: 0x62,
  F8: 0x64, F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f, F13: 0x69,
  F14: 0x6b, F15: 0x71, F16: 0x6a, F17: 0x40, F18: 0x4f, F19: 0x50,
};

/** Reverse lookup for the native `hotkey-captured` payload. */
export function keycodeToCode(keycode: number): string | undefined {
  return KEYCODE_TO_CODE[keycode];
}

export interface HotkeyCaptured {
  mods: string;
  keycode: number;
  cancelled: boolean;
}

/** While recording, the native tap swallows key-downs and reports them here. */
export async function beginHotkeyRecording(): Promise<void> {
  await invoke("begin_hotkey_recording");
}

export async function endHotkeyRecording(): Promise<void> {
  await invoke("end_hotkey_recording");
}

export function listenHotkeyCaptured(
  cb: (payload: HotkeyCaptured) => void,
): Promise<UnlistenFn> {
  return listen<HotkeyCaptured>("hotkey-captured", (event) => cb(event.payload));
}

const KEYCODE_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(KEYBOARD_CODE_TO_KEYCODE).map(([code, keycode]) => [keycode, code]),
);

/** Push the persisted third-party picker hotkeys to the input listener. */
export async function setCaptureHotkeys(
  hotkeys: Array<{ mods: string; code: string }>,
): Promise<void> {
  const parsed = hotkeys
    .map((hotkey) => ({ mods: hotkey.mods, keycode: KEYBOARD_CODE_TO_KEYCODE[hotkey.code] }))
    .filter((hotkey) => typeof hotkey.keycode === "number");
  await invoke("set_capture_hotkeys", { hotkeys: parsed });
}

export type SystemSettingsPane = "input-monitoring" | "accessibility" | "login-items";

/** Open System Settings on a known pane (macOS; no-op elsewhere). */
export async function openSystemSettingsPane(pane: SystemSettingsPane): Promise<void> {
  await invoke("open_settings_pane", { pane });
}

/** Sync native visibility, including overlays created while the app is hidden. */
export async function listenOverlayVisibility(
  cb: (show: boolean) => void,
): Promise<UnlistenFn> {
  let receivedChange = false;
  const unlisten = await listen<boolean>("overlay-visibility-changed", (event) => {
    receivedChange = true;
    cb(event.payload);
  });
  try {
    const show = await invoke<boolean>("get_overlay_visible");
    // A tray toggle may arrive while the initial state request is in flight.
    if (!receivedChange) cb(show);
    return unlisten;
  } catch (err) {
    unlisten();
    throw err;
  }
}

export async function getOverlayScale(): Promise<number> {
  return invoke<number>("get_overlay_scale");
}

/** Close + recreate secondary overlays (sleep/wake zombie recovery). */
export async function forceRebuildOverlays(mode: string): Promise<void> {
  await invoke("force_rebuild_overlays", { mode });
}

export async function listenCursorLocal(
  cb: (pos: CursorLocal) => void,
): Promise<UnlistenFn> {
  const unlisten = await listen<CursorLocal>("cursor-local", (e) => cb(e.payload));
  try {
    await requestOverlayCursor();
    return unlisten;
  } catch (err) {
    unlisten();
    throw err;
  }
}

/** Ask the native poller to replay even a stationary cursor. */
export async function requestOverlayCursor(): Promise<void> {
  await invoke("request_overlay_cursor");
}

/** Update the disabled "today" line in the tray menu (numbers only; label follows locale). */
export async function setTrayStats(kills: number, bestCombo: number): Promise<void> {
  try {
    await invoke("set_tray_stats", {
      kills: Math.max(0, Math.floor(kills)),
      bestCombo: Math.max(0, Math.floor(bestCombo)),
    });
  } catch (err) {
    console.error("set_tray_stats failed", err);
  }
}

/** Check the active rain kind in the tray Weather submenu. */
export async function setTrayRain(
  raining: boolean,
  kind: string | null,
): Promise<void> {
  try {
    await invoke("set_tray_rain", { raining, kind });
  } catch (err) {
    console.error("set_tray_rain failed", err);
  }
}

/**
 * Push spray tray cooldown. Remaining seconds; 0 = ready.
 * The primary overlay ticks this every second so the label shows a countdown.
 */
export async function setTraySpray(sprayCooldownSec: number): Promise<void> {
  try {
    await invoke("set_tray_spray", {
      sprayCooldownSec: Math.max(0, Math.ceil(sprayCooldownSec)),
    });
  } catch (err) {
    console.error("set_tray_spray failed", err);
  }
}

/** Monitor hot-plug: primary overlay should rebuild the overlay layout. */
export async function listenDisplaysChanged(
  cb: () => void,
): Promise<UnlistenFn> {
  return listen("displays-changed", () => cb());
}

/** System sleep → wake: primary overlay should re-fit displays and resume audio. */
export async function listenSystemResumed(
  cb: () => void,
): Promise<UnlistenFn> {
  return listen("system-resumed", () => cb());
}

export async function listenTray(
  cb: (cmd: TrayCommand) => void,
): Promise<UnlistenFn> {
  return listen<string>("tray-command", (e) => cb(e.payload as TrayCommand));
}

/** Primary overlay broadcasts chaos events so every display banners + reacts. */
export async function listenRandomEvent(
  cb: (kind: RandomEventKind) => void,
): Promise<UnlistenFn> {
  return listen<{ kind: RandomEventKind }>("random-event", (e) => cb(e.payload.kind));
}

export async function fitWindowToDisplay(): Promise<{
  width: number;
  height: number;
  dpr: number;
}> {
  // CSS viewport is the most reliable source for canvas layout size,
  // especially on secondary monitors with different DPI.
  const width = window.innerWidth || document.documentElement.clientWidth || 1440;
  const height = window.innerHeight || document.documentElement.clientHeight || 900;
  const dpr = window.devicePixelRatio || 1;
  return { width, height, dpr };
}

/** Route reports from every display to the single stats owner. */
export async function reportKill(report: KillReport): Promise<void> {
  await emitTo("overlay", "bug-killed", report);
}

export async function listenKillReports(
  cb: (report: KillReport) => void,
): Promise<UnlistenFn> {
  return listen<KillReport>("bug-killed", (event) => cb(event.payload));
}
