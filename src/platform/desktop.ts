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
 * Invoke a Rust command. Rejects off-runtime so `await` callers can fall back.
 * Uses the canonical v2 API: the legacy `__TAURI__.core` global is an empty
 * object with `withGlobalTauri: false`, so reaching invoke through it throws
 * a TypeError on every call.
 */
export function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error("native runtime unavailable"));
  return import("@tauri-apps/api/core").then((m) => m.invoke<T>(command, args));
}

/** Listen to a native (cross-WebView) event. Off-runtime resolves a no-op. */
export function listenNative<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) return Promise.resolve(() => {});
  return import("@tauri-apps/api/event").then(
    (m) => m.listen<T>(event, (e) => handler(e.payload)).catch(() => () => {}),
    () => () => {},
  );
}

/** Emit a native event. Off-runtime resolves without sending. */
export function emitNative(event: string, payload: unknown): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return import("@tauri-apps/api/event").then(
    (m) => m.emit(event, payload),
    () => {},
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

let resolvedLabel: string | null | undefined;

/** Current WebView label (`overlay`, `overlay-1`, …); null off-runtime. */
export function getWindowLabel(): string | null {
  if (resolvedLabel !== undefined) return resolvedLabel;
  try {
    return tauriGlobal()?.__TAURI__?.window?.getCurrent?.()?.label ?? null;
  } catch {
    return null;
  }
}

/**
 * Metadata-backed label resolution. The legacy `__TAURI__.window` global is
 * absent with `withGlobalTauri: false`, so the sync lookup above yields null
 * and every `isPrimaryOverlay()` check silently fails. Call once at startup
 * before any such check; afterwards `getWindowLabel()` serves the cache.
 * Keeps zero static dependencies (dynamic import runs on desktop only).
 */
export async function resolveWindowLabel(): Promise<string | null> {
  if (resolvedLabel !== undefined) return resolvedLabel;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    resolvedLabel = getCurrentWindow().label ?? getWindowLabel();
  } catch {
    resolvedLabel = getWindowLabel();
  }
  return resolvedLabel;
}

/** Rename the native window (desktop settings/updater windows); no-op on web. */
export function setWindowTitle(title: string): void {
  if (!isTauri()) return;
  // Canonical v2 API first: the legacy `__TAURI__.window.getCurrent` global
  // is absent with `withGlobalTauri: false`, which fails silently and leaves
  // the tauri.conf placeholder title in the native title bar.
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
    .catch(() => {
      try {
        void tauriGlobal()?.__TAURI__?.window
          ?.getCurrent?.()
          ?.setTitle?.(title);
      } catch {
        // ignore — document.title is set by the caller
      }
    });
}
