/**
 * Key-value persistence for the web shell.
 *
 * Desktop keeps using the Tauri store plugin (`settings.json`); the web demo
 * (Cloudflare Pages, mobile browsers) has no plugin host, so settings and
 * daily stats live in `localStorage`. Private mode / unavailable storage
 * degrades to a process-local memory map — the app keeps running, it just
 * forgets on reload.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

let fallback: StorageLike | null = null;

/** `localStorage` when available, otherwise a shared in-memory map. */
export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") {
      // Probe once: Safari private mode throws on write, not on access.
      const probe = "__bugscurry_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    // fall through to memory
  }
  if (!fallback) fallback = memoryStorage();
  return fallback;
}

/** Read a JSON document; returns null when missing, corrupt, or unreadable. */
export function loadJson<T>(storage: StorageLike, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write a JSON document. Returns false when the write failed (quota, …). */
export function saveJson(storage: StorageLike, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
