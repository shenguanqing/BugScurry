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

export async function getOverlayScale(): Promise<number> {
  return invoke<number>("get_overlay_scale");
}

export async function listenCursorLocal(
  cb: (pos: CursorLocal) => void,
): Promise<UnlistenFn> {
  return listen<CursorLocal>("cursor-local", (e) => cb(e.payload));
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
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const dpr = await win.scaleFactor();
  const size = await win.innerSize();
  return {
    width: size.width / dpr,
    height: size.height / dpr,
    dpr,
  };
}
