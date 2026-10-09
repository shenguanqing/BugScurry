import { defaultStorage, loadJson, saveJson, type StorageLike } from "../platform/webStorage";

/**
 * Web-demo backdrop: a fake "desktop" behind the bugs so the page reads like
 * the desktop overlay. Desktop builds never touch this — they have a real
 * desktop underneath. Persisted under its own localStorage key so the shared
 * `Settings` schema (and `settings.json`) stays untouched.
 */

export type BackdropMode = "checker" | "color" | "image";

export interface BackdropState {
  mode: BackdropMode;
  /** Base color for `checker` (second tone is derived) and `color`. */
  color: string;
  /** Currently shown wallpaper as a data URL; null when none. */
  image: string | null;
  /** Uploaded wallpaper library (persisted on a best-effort budget). */
  images: string[];
}

export const BACKDROP_STORE_KEY = "bugscurry.backdrop";

export const DEFAULT_BACKDROP: BackdropState = {
  mode: "color",
  color: "#2e3440",
  image: null,
  images: [],
};

/** Small built-in wallpaper palette (solid colors + gradients). */
export const BACKDROP_SWATCHES = [
  "#2e3440",
  "#3b4252",
  "#4c566a",
  "#7b8ca3",
  "#5e6e5a",
  "#8a6f5c",
  "#d8dee9",
  "#e9e2d5",
] as const;

/** A single upload larger than this stays session-only (localStorage quota). */
export const BACKDROP_IMAGE_MAX_BYTES = 1_500_000;
/** Total persisted wallpaper budget across the whole library. */
export const BACKDROP_TOTAL_BYTES = 3_500_000;
/** Cap on library size (memory + quota bound). */
export const BACKDROP_MAX_IMAGES = 8;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image");
}

export function normalizeBackdrop(raw: unknown): BackdropState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BACKDROP, images: [] };
  const r = raw as Partial<BackdropState>;
  const m = r.mode;
  let mode: BackdropMode =
    m === "checker" || m === "color" || m === "image" ? m : DEFAULT_BACKDROP.mode;
  const color =
    typeof r.color === "string" && HEX_COLOR.test(r.color) ? r.color : DEFAULT_BACKDROP.color;
  const rawImages = Array.isArray(r.images) ? r.images : [];
  const images = rawImages.filter(isImageUrl).slice(0, BACKDROP_MAX_IMAGES);
  // Migrate the pre-library single image instead of dropping it.
  if (isImageUrl(r.image) && !images.includes(r.image)) images.unshift(r.image);
  const trimmed = images.slice(0, BACKDROP_MAX_IMAGES);
  const image =
    isImageUrl(r.image) && trimmed.includes(r.image) ? r.image : (trimmed[0] ?? null);
  if (mode === "image" && !image) mode = DEFAULT_BACKDROP.mode;
  return { mode, color, images: trimmed, image };
}

export function loadBackdrop(storage: StorageLike = defaultStorage()): BackdropState {
  return normalizeBackdrop(loadJson(storage, BACKDROP_STORE_KEY));
}

export function saveBackdrop(
  state: BackdropState,
  storage: StorageLike = defaultStorage(),
): BackdropState {
  const next = normalizeBackdrop(state);
  // Persist selected-first within the total budget; oversized or over-budget
  // uploads stay session-only in the returned state.
  const kept: string[] = [];
  let used = 0;
  const candidates = [
    ...(next.image ? [next.image] : []),
    ...next.images.filter((img) => img !== next.image),
  ];
  for (const img of candidates) {
    if (img.length > BACKDROP_IMAGE_MAX_BYTES) continue;
    if (used + img.length > BACKDROP_TOTAL_BYTES) continue;
    used += img.length;
    kept.push(img);
  }
  const image = next.image && kept.includes(next.image) ? next.image : (kept[0] ?? null);
  let mode = next.mode;
  if (mode === "image" && !image) mode = DEFAULT_BACKDROP.mode;
  saveJson(storage, BACKDROP_STORE_KEY, { ...next, images: kept, image, mode });
  return next;
}

/** Upload (or re-select) a wallpaper: it becomes current immediately. */
export function addBackdropImage(state: BackdropState, dataUrl: string): BackdropState {
  const s = normalizeBackdrop(state);
  if (!isImageUrl(dataUrl)) return s;
  const images = s.images.includes(dataUrl) ? [...s.images] : [...s.images, dataUrl];
  // Evict the oldest non-selected wallpaper when over the cap.
  while (images.length > BACKDROP_MAX_IMAGES) {
    const idx = images.findIndex((img) => img !== s.image && img !== dataUrl);
    if (idx < 0) break;
    images.splice(idx, 1);
  }
  return saveBackdrop({ ...s, mode: "image", image: dataUrl, images });
}

/** Switch to an already-uploaded wallpaper. */
export function selectBackdropImage(state: BackdropState, dataUrl: string): BackdropState {
  const s = normalizeBackdrop(state);
  if (!s.images.includes(dataUrl)) return s;
  return saveBackdrop({ ...s, mode: "image", image: dataUrl });
}

/** Delete a wallpaper; falls back to the next one, then to solid color. */
export function removeBackdropImage(state: BackdropState, dataUrl: string): BackdropState {
  const s = normalizeBackdrop(state);
  const images = s.images.filter((img) => img !== dataUrl);
  const image = s.image === dataUrl ? (images[0] ?? null) : s.image;
  const mode = image ? s.mode : DEFAULT_BACKDROP.mode;
  return saveBackdrop({ ...s, images, image, mode });
}

/** CSS background value for the backdrop layer (image wins when present). */
export function backdropStyle(state: BackdropState): Record<string, string> {
  const s = normalizeBackdrop(state);
  if (s.mode === "image" && s.image) {
    return {
      backgroundImage: `url("${s.image}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: s.color,
    };
  }
  if (s.mode === "color") {
    return { background: s.color };
  }
  return {
    backgroundColor: s.color,
    backgroundImage:
      "repeating-conic-gradient(color-mix(in srgb, #ffffff 14%, transparent) 0% 25%, transparent 0% 50%)",
    backgroundSize: "28px 28px",
  };
}
