import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TrayCommand } from "../core/types";

export interface CursorPayload {
  x: number;
  y: number;
}

export async function setOverlayClickable(clickable: boolean): Promise<void> {
  await invoke("set_overlay_clickable", { clickable });
}

export async function getOverlayScale(): Promise<number> {
  return invoke<number>("get_overlay_scale");
}

export async function listenCursor(
  cb: (pos: CursorPayload) => void,
): Promise<UnlistenFn> {
  return listen<CursorPayload>("cursor-position", (e) => cb(e.payload));
}

export async function listenTray(
  cb: (cmd: TrayCommand) => void,
): Promise<UnlistenFn> {
  return listen<string>("tray-command", (e) => cb(e.payload as TrayCommand));
}

export async function fitWindowToDisplay(): Promise<{ width: number; height: number; dpr: number }> {
  const win = getCurrentWindow();
  const dpr = await win.scaleFactor();
  // Primary display size via inner size of current (already fitted by Rust on startup)
  const size = await win.innerSize();
  return {
    width: size.width / dpr,
    height: size.height / dpr,
    dpr,
  };
}
