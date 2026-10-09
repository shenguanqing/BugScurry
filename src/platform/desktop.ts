/**
 * Desktop vs web capability boundary (mirrors the Emerge `platform/desktop` pattern).
 *
 * The Tauri runtime injects `window.__TAURI_INTERNALS__` into every WebView.
 * When it is absent we are running as a plain web page (Cloudflare Pages demo,
 * mobile browsers) and every native call below degrades to a no-op — the
 * caller never needs to know which shell it runs in.
 *
 * This module has zero dependencies so it can be imported from anywhere,
 * including pure core code and Vitest (node has no `window`).
 */

type TauriGlobal = {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: {
    core: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
    event?: {
      emit?(event: string, payload: unknown): Promise<void>;
      listen<T>(
        event: string,
        handler: (event: { payload: T }) => void,
      ): Promise<() => void>;
    };
    window?: {
      getCurrent?: () => {
        label?: string;
        setTitle?: (title: string) => Promise<void>;
      };
    };
  };
};

function tauriGlobal(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return window as typeof window & TauriGlobal;
}

/** True inside a Tauri WebView; false on the plain web (and in node tests). */
export function isTauri(): boolean {
  const g = tauriGlobal();
  return !!g && "__TAURI_INTERNALS__" in g;
}

/**
 * Invoke a Rust command. Rejects off-runtime so `await` callers can fall back;
 * `tauriBridge` guards with `isTauri()` first and never reaches this on web.
 */
export function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = tauriGlobal()?.__TAURI__;
  if (!api) return Promise.reject(new Error("native runtime unavailable"));
  return api.core.invoke<T>(command, args);
}

/** Listen to a native (cross-WebView) event. Off-runtime resolves a no-op. */
export function listenNative<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const api = tauriGlobal()?.__TAURI__;
  if (!api?.event?.listen) return Promise.resolve(() => {});
  return api.event.listen<T>(event, (e) => handler(e.payload)).then(
    (un) => un,
    () => () => {},
  );
}

/** Emit a native event. Off-runtime resolves without sending. */
export function emitNative(event: string, payload: unknown): Promise<void> {
  return (
    tauriGlobal()?.__TAURI__?.event?.emit?.(event, payload) ?? Promise.resolve()
  );
}

/**
 * Same-page event bridge for the web shell (and any in-page listeners on
 * desktop): the single-page demo has no second WebView, so settings/overlay
 * commands travel as DOM CustomEvents instead of Tauri events.
 */
export function emitLocal(event: string, payload: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

export function listenLocal<T>(event: string, handler: (payload: T) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event): void => handler((e as CustomEvent<T>).detail);
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}

/** Current WebView label (`overlay`, `overlay-1`, …); null off-runtime. */
export function getWindowLabel(): string | null {
  try {
    return tauriGlobal()?.__TAURI__?.window?.getCurrent?.()?.label ?? null;
  } catch {
    return null;
  }
}

/** Rename the native window (desktop settings window); no-op on web. */
export function setWindowTitle(title: string): void {
  try {
    void tauriGlobal()?.__TAURI__?.window
      ?.getCurrent?.()
      ?.setTitle?.(title);
  } catch {
    // ignore — document.title is set by the caller
  }
}
