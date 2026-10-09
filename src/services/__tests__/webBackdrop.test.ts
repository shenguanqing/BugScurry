import { describe, expect, it } from "vitest";
import {
  BACKDROP_STORE_KEY,
  addBackdropImage,
  backdropStyle,
  DEFAULT_BACKDROP,
  loadBackdrop,
  normalizeBackdrop,
  removeBackdropImage,
  saveBackdrop,
  selectBackdropImage,
} from "../webBackdrop";
import type { StorageLike } from "../../platform/webStorage";

function memory(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("web backdrop state", () => {
  it("defaults to the default solid color", () => {
    expect(loadBackdrop(memory())).toEqual(DEFAULT_BACKDROP);
    expect(normalizeBackdrop(undefined)).toEqual(DEFAULT_BACKDROP);
  });

  it("rejects invalid modes, colors, and non-image data URLs", () => {
    expect(
      normalizeBackdrop({ mode: "lava", color: "red", image: "http://x/y.png" }),
    ).toEqual({ ...DEFAULT_BACKDROP });
  });

  it("falls back to the default mode when image mode has no image", () => {
    expect(normalizeBackdrop({ mode: "image", color: "#112233", image: null }).mode).toBe(
      DEFAULT_BACKDROP.mode,
    );
  });

  it("round-trips through storage", () => {
    const storage = memory();
    const saved = saveBackdrop({ mode: "color", color: "#112233", image: null, images: [] }, storage);
    expect(saved).toEqual({ mode: "color", color: "#112233", image: null, images: [] });
    expect(loadBackdrop(storage)).toEqual(saved);
    expect(storage.getItem(BACKDROP_STORE_KEY)).toContain("#112233");
  });

  it("keeps oversized uploads session-only without dropping the image", () => {
    const storage = memory();
    const big = "data:image/png;base64," + "A".repeat(2_000_000);
    const saved = saveBackdrop({ mode: "image", color: "#112233", image: big, images: [big] }, storage);
    expect(saved.mode).toBe("image");
    expect(saved.image).toBe(big);
    // Persisted copy drops the payload (and the mode) so quota is not blown.
    expect(loadBackdrop(storage)).toEqual({
      mode: DEFAULT_BACKDROP.mode,
      color: "#112233",
      image: null,
      images: [],
    });
  });

  it("renders checker / color / image styles", () => {
    expect(backdropStyle({ mode: "checker", color: "#112233", image: null, images: [] }).backgroundSize).toBe("28px 28px");
    expect(backdropStyle({ mode: "color", color: "#112233", image: null, images: [] })).toEqual({
      background: "#112233",
    });
    const img = "data:image/png;base64,AAA";
    const style = backdropStyle({ mode: "image", color: "#112233", image: img, images: [img] });
    expect(style.backgroundImage).toContain(img);
    expect(style.backgroundSize).toBe("cover");
  });

  it("builds a wallpaper library: add selects, re-add is idempotent", () => {
    const storage = memory();
    const a = "data:image/png;base64,AAA";
    const b = "data:image/png;base64,BBB";
    let s = addBackdropImage(loadBackdrop(storage), a);
    s = addBackdropImage({ ...s }, b);
    expect(s).toMatchObject({ mode: "image", image: b, images: [a, b] });
    // Re-adding selects without duplicating.
    s = addBackdropImage(s, a);
    expect(s.images).toEqual([a, b]);
    expect(s.image).toBe(a);
    // Library survives reload.
    const saved = saveBackdrop(s, storage);
    expect(loadBackdrop(storage)).toEqual(saved);
  });

  it("selects and removes wallpapers with sensible fallbacks", () => {
    const a = "data:image/png;base64,AAA";
    const b = "data:image/png;base64,BBB";
    let s = normalizeBackdrop({ mode: "color", color: "#112233", image: a, images: [a, b] });
    s = selectBackdropImage(s, b);
    expect(s).toMatchObject({ mode: "image", image: b });
    // Removing a non-selected wallpaper keeps the selection.
    s = removeBackdropImage(s, a);
    expect(s).toMatchObject({ image: b, images: [b], mode: "image" });
    // Removing the selection falls back to the next, then to solid color.
    s = removeBackdropImage(s, b);
    expect(s).toMatchObject({ image: null, images: [], mode: DEFAULT_BACKDROP.mode });
    // Unknown urls are ignored.
    expect(selectBackdropImage(s, a)).toEqual(s);
  });

  it("migrates the pre-library single image into the library", () => {
    const img = "data:image/png;base64,AAA";
    const s = normalizeBackdrop({ mode: "color", color: "#112233", image: img });
    expect(s.images).toEqual([img]);
    expect(s.image).toBe(img);
  });
});
