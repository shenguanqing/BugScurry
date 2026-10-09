import { describe, expect, it } from "vitest";
import {
  BACKDROP_STORE_KEY,
  addBackdropImage,
  backdropFit,
  backdropStyle,
  backdropThemeColor,
  DEFAULT_BACKDROP,
  loadBackdrop,
  normalizeBackdrop,
  removeBackdropImage,
  saveBackdrop,
  selectBackdropImage,
  selectBuiltinBackdrop,
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
    const saved = saveBackdrop({ mode: "color", color: "#112233", image: null, images: [], builtinId: null }, storage);
    expect(saved).toEqual({ mode: "color", color: "#112233", image: null, images: [], builtinId: null });
    expect(loadBackdrop(storage)).toEqual(saved);
    expect(storage.getItem(BACKDROP_STORE_KEY)).toContain("#112233");
  });

  it("keeps oversized uploads session-only without dropping the image", () => {
    const storage = memory();
    const big = "data:image/png;base64," + "A".repeat(2_000_000);
    const saved = saveBackdrop({ mode: "image", color: "#112233", image: big, images: [big], builtinId: null }, storage);
    expect(saved.mode).toBe("image");
    expect(saved.image).toBe(big);
    // Persisted copy drops the payload (and the mode) so quota is not blown.
    expect(loadBackdrop(storage)).toEqual({
      mode: DEFAULT_BACKDROP.mode,
      color: "#112233",
      image: null,
      images: [],
      builtinId: null,
    });
  });

  it("renders checker / color / image styles", () => {
    expect(backdropStyle({ mode: "checker", color: "#112233", image: null, images: [], builtinId: null }).backgroundSize).toBe("28px 28px");
    expect(backdropStyle({ mode: "color", color: "#112233", image: null, images: [], builtinId: null })).toEqual({
      background: "#112233",
    });
    const img = "data:image/png;base64,AAA";
    const style = backdropStyle({ mode: "image", color: "#112233", image: img, images: [img], builtinId: null });
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

  it("selects built-in catalog wallpapers and persists the id", () => {
    const storage = memory();
    let s = loadBackdrop(storage);
    s = selectBuiltinBackdrop(s, "win11-bloom-dark", storage);
    expect(s).toMatchObject({ mode: "image", builtinId: "win11-bloom-dark" });
    expect(backdropStyle(s).backgroundImage).toContain("wallpaperhub");
    expect(backdropThemeColor(s)).toBe(s.color);
    // Round-trips as a tiny id, not a data URL.
    expect(loadBackdrop(storage).builtinId).toBe("win11-bloom-dark");
    // Unknown ids are ignored; uploads clear the catalog selection.
    expect(selectBuiltinBackdrop(s, "nope")).toEqual(s);
    const img = "data:image/png;base64,AAA";
    s = selectBackdropImage(addBackdropImage(s, img), img);
    expect(s.builtinId).toBeNull();
    // A stale builtin id resolves to nothing and falls back to solid color.
    const stale = normalizeBackdrop({ mode: "image", color: "#112233", image: null, images: [], builtinId: "gone" });
    expect(stale.builtinId).toBeNull();
    expect(backdropStyle({ ...stale, mode: "image" }).background).toBe("#112233");
  });

  it.each(["win11-bloom-light", "mac-updating"])(
    "keeps %s selected after deleting the last custom wallpaper",
    (builtinId) => {
      const storage = memory();
      const img = "data:image/png;base64,AAA";
      const uploaded = addBackdropImage(loadBackdrop(storage), img, storage);
      const selected = selectBuiltinBackdrop(uploaded, builtinId, storage);
      const removed = removeBackdropImage(selected, img, storage);

      expect(removed).toMatchObject({ mode: "image", builtinId, image: null, images: [] });
      expect(backdropStyle(removed)).toEqual(backdropStyle(selected));
      expect(backdropFit(removed)).toBe(backdropFit(selected));
      expect(backdropThemeColor(removed)).toBe(backdropThemeColor(selected));
      expect(loadBackdrop(storage)).toEqual(removed);
    },
  );

  it("keeps the built-in selection while deleting multiple custom wallpapers", () => {
    const storage = memory();
    const a = "data:image/png;base64,AAA";
    const b = "data:image/png;base64,BBB";
    let state = addBackdropImage(loadBackdrop(storage), a, storage);
    state = addBackdropImage(state, b, storage);
    state = selectBuiltinBackdrop(state, "win11-bloom-dark", storage);

    state = removeBackdropImage(state, b, storage);
    expect(state).toMatchObject({ mode: "image", builtinId: "win11-bloom-dark", image: a, images: [a] });
    state = removeBackdropImage(state, a, storage);
    expect(state).toMatchObject({ mode: "image", builtinId: "win11-bloom-dark", image: null, images: [] });
    expect(loadBackdrop(storage)).toEqual(state);
  });

  it("selects a newly uploaded wallpaper after a built-in selection", () => {
    const storage = memory();
    const img = "data:image/png;base64,AAA";
    const selected = selectBuiltinBackdrop(loadBackdrop(storage), "win11-bloom-light", storage);
    const uploaded = addBackdropImage(selected, img, storage);

    expect(uploaded).toMatchObject({ mode: "image", builtinId: null, image: img, images: [img] });
    expect(backdropStyle(uploaded).backgroundImage).toContain(img);
    expect(loadBackdrop(storage)).toEqual(uploaded);
  });

  it("renders the CSS Windows screen, the Apple boot asset, and tints chrome", () => {
    const win = normalizeBackdrop({ mode: "image", color: "#112233", image: null, images: [], builtinId: "win-updating" });
    expect(backdropStyle(win)).toEqual({ background: "#0078d7" });
    expect(backdropThemeColor(win)).toBe("#0078d7");
    // Official Apple boot asset: contained on black so any ratio stays seamless.
    const mac = normalizeBackdrop({ mode: "image", color: "#112233", image: null, images: [], builtinId: "mac-updating" });
    const macStyle = backdropStyle(mac);
    expect(macStyle.backgroundImage).toContain("mac-boot.png");
    expect(macStyle.backgroundSize).toBeUndefined();
    expect(backdropFit(mac)).toBe("contain");
    expect(backdropFit(loadBackdrop(memory()))).toBe("cover");
    expect(backdropThemeColor(mac)).toBe("#000000");
    // Non-image modes never render the catalog entry.
    expect(backdropStyle({ ...win, mode: "color" })).toEqual({ background: "#112233" });
    expect(backdropThemeColor({ ...win, mode: "color" })).toBe("#112233");
  });
});
