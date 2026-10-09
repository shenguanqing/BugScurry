/**
 * Vitest runs in node (no `window`), where `isTauri()` is false. Tests that
 * cover the desktop path simulate a Tauri WebView by stubbing the runtime
 * marker that `src/platform/desktop.ts` checks at call time.
 */

type MutableGlobal = Record<string, unknown>;

function globals(): MutableGlobal {
  return globalThis as unknown as MutableGlobal;
}

export function mockTauriRuntime(): void {
  const g = globals();
  if (typeof g.window !== "object" || g.window === null) g.window = {};
  (g.window as MutableGlobal).__TAURI_INTERNALS__ = {};
}

export function mockWebRuntime(): void {
  const g = globals();
  if (typeof g.window === "object" && g.window !== null) {
    delete (g.window as MutableGlobal).__TAURI_INTERNALS__;
  }
}
