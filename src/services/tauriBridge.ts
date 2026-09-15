import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TrayCommand } from "../core/types";

/** Cursor in this overlay window's local logical CSS pixels. */
export interface CursorLocal {
  x: number;
  y: number;
  inside: boolean;
}

export async function setOverlayClickable(clickable: boolean): Promise<void> {
  await invoke("set_overlay_clickable", { clickable });
}

/** Pause/resume the Rust cursor poller (primary overlay only). */
export async function setCursorPollerEnabled(enabled: boolean): Promise<void> {
  await invoke("set_cursor_poller_enabled", { enabled });
}

export async function getOverlayScale(): Promise<number> {
  return invoke<number>("get_overlay_scale");
}

export async function listenCursorLocal(
  cb: (pos: CursorLocal) => void,
): Promise<UnlistenFn> {
  return listen<CursorLocal>("cursor-local", (e) => cb(e.payload));
}

/** Update the disabled "today" line in the tray menu. */
export async function setTrayStats(label: string): Promise<void> {
  try {
    await invoke("set_tray_stats", { label });
  } catch (err) {
    console.error("set_tray_stats failed", err);
  }
}

/** Monitor hot-plug: primary overlay should rebuild the overlay layout. */
export async function listenDisplaysChanged(
  cb: () => void,
): Promise<UnlistenFn> {
  return listen("displays-changed", () => cb());
}

export async function listenTray(
  cb: (cmd: TrayCommand) => void,
): Promise<UnlistenFn> {
  return listen<string>("tray-command", (e) => cb(e.payload as TrayCommand));
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
