/**
 * Built-in wallpaper catalog for the web-demo backdrop.
 *
 * Nothing is bundled: entries hotlink the origin hosts (512pixels for macOS,
 * WallpaperHub CDN for Windows) and stream on demand, so the repo and `dist/`
 * stay lean. Uploads (`BackdropState.images`) keep working alongside.
 *
 * Sources: 512pixels 6K macOS archive (https://512pixels.net/projects/default-mac-wallpapers-in-5k/),
 * WallpaperHub Microsoft collection (https://www.wallpaperhub.app/creators/microsoft).
 */

export interface BuiltinWallpaper {
  id: string;
  platform: "windows" | "macos";
  /** Proper noun, locale-independent: "Windows 11", "macOS Tahoe", … */
  version: string;
  /** "light" | "dark" localization key suffix (`web.backdrop.light/dark`). */
  variant: "light" | "dark";
  /** Grid thumbnail (ignored when `fake` is set). */
  thumb: string;
  /** Full-res backdrop (4K–6K, ignored when `fake` is set). */
  full: string;
  /** Base background color (backdrop + theme-color for `fake` entries). */
  color?: string;
  /** CSS-composed screen (zero downloads, animated) instead of an image. */
  fake?: "win-update";
  /** Backdrop fit (default cover; the Apple boot asset is contain on black). */
  fit?: "cover" | "contain";
}

const PX = "https://media.512pixels.net";
const WH = "https://cdn.wallpaperhub.app/cloudcache";

export const BUILTIN_WALLPAPERS: readonly BuiltinWallpaper[] = [
  {
    id: "win11-bloom-light",
    platform: "windows",
    version: "Windows 11",
    variant: "light",
    thumb: `${WH}/0/b/5/3/a/6/0b53a65cd1849ae5c32389840f93812ec14b9cd3.jpg`,
    full: `${WH}/2/b/b/9/0/6/2bb9062555f5b2bf7e5a5f8d92dfb841ec6919e8.jpg`,
  },
  {
    id: "win11-bloom-dark",
    platform: "windows",
    version: "Windows 11",
    variant: "dark",
    thumb: `${WH}/5/2/1/5/f/c/5215fcd24355e3ac8acd2eb1daf4ba3383806c0f.jpg`,
    full: `${WH}/a/1/c/a/d/b/a1cadb0911675232054cc13deee6a3221b4dd88e.jpg`,
  },
  {
    id: "win10-hero-light",
    platform: "windows",
    version: "Windows 10",
    variant: "light",
    thumb: `${WH}/5/6/c/e/c/c/56ceccb49a40d1b2d0e4896bc6d930d1c7940591.jpg`,
    full: `${WH}/7/c/2/f/3/4/7c2f345bdfcadb8a3faf483ebaa2e9aea712bbdb.jpg`,
  },
  {
    id: "macos-tahoe-light",
    platform: "macos",
    version: "macOS Tahoe",
    variant: "light",
    thumb: `${PX}/wp-content/uploads/2025/06/26-Tahoe-Light-6K-thumb.jpeg`,
    // The 6K PNG is 50MB+; the large thumb jpeg is plenty sharp for a backdrop.
    full: `${PX}/wp-content/uploads/2025/06/26-Tahoe-Light-6K-thumb.jpeg`,
  },
  {
    id: "macos-tahoe-dark",
    platform: "macos",
    version: "macOS Tahoe",
    variant: "dark",
    thumb: `${PX}/wp-content/uploads/2025/06/26-Tahoe-Dark-6K-thumb.jpeg`,
    // The 6K PNG is 50MB+; the large thumb jpeg is plenty sharp for a backdrop.
    full: `${PX}/wp-content/uploads/2025/06/26-Tahoe-Dark-6K-thumb.jpeg`,
  },
  {
    id: "macos-sequoia-light",
    platform: "macos",
    version: "macOS Sequoia",
    variant: "light",
    thumb: `${PX}/wp-content/uploads/2025/06/15-Sequoia-Light-thumbnail.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/15-Sequoia-Light-6K.jpg`,
  },
  {
    id: "macos-sequoia-dark",
    platform: "macos",
    version: "macOS Sequoia",
    variant: "dark",
    thumb: `${PX}/wp-content/uploads/2025/06/15-Sequoia-Dark-thumbnail.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/15-Sequoia-Dark-6K.jpg`,
  },
  {
    id: "macos-sonoma-light",
    platform: "macos",
    version: "macOS Sonoma",
    variant: "light",
    thumb: `${PX}/wp-content/uploads/2025/06/14-Sonoma-Light-thumb.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/14-Sonoma-Light.jpg`,
  },
  {
    id: "macos-sonoma-dark",
    platform: "macos",
    version: "macOS Sonoma",
    variant: "dark",
    thumb: `${PX}/wp-content/uploads/2025/06/14-Sonoma-Dark-thumb.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/14-Sonoma-Dark.jpg`,
  },
  {
    id: "macos-ventura-light",
    platform: "macos",
    version: "macOS Ventura",
    variant: "light",
    thumb: `${PX}/wp-content/uploads/2025/06/13-Ventura-Light-thumb.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/13-Ventura-Light.jpg`,
  },
  {
    id: "macos-bigsur-day",
    platform: "macos",
    version: "macOS Big Sur",
    variant: "light",
    thumb: `${PX}/wp-content/uploads/2025/06/11-0-Day-thumbnail.jpg`,
    full: `${PX}/downloads/macos-wallpapers-6k/11-Big-Sur-Day-6k.jpg`,
  },
  {
    id: "win-bsod",
    platform: "windows",
    version: "Windows 彩蛋",
    variant: "dark",
    thumb: "https://i.redd.it/1ajtu5bta3ka1.png",
    full: "https://i.redd.it/1ajtu5bta3ka1.png",
  },
  {
    id: "win-updating",
    platform: "windows",
    version: "Windows 彩蛋",
    variant: "light",
    thumb: "",
    full: "",
    color: "#0078d7",
    fake: "win-update",
  },
  {
    id: "mac-updating",
    platform: "macos",
    version: "macOS 彩蛋",
    variant: "dark",
    // Vendored: Apple's CDN copy carries a 3px gray frame; this is the same
    // art with the frame shaved off (2.7KB).
    thumb: "./mac-boot.png",
    full: "./mac-boot.png",
    color: "#000000",
    fit: "contain",
  },
];

export function getBuiltinWallpaper(id: string | null | undefined): BuiltinWallpaper | undefined {
  if (!id) return undefined;
  return BUILTIN_WALLPAPERS.find((w) => w.id === id);
}

export interface BuiltinGroup {
  platform: BuiltinWallpaper["platform"];
  versions: Array<{ version: string; items: BuiltinWallpaper[] }>;
}

/** Windows group first, then macOS; versions keep catalog order. */
export function groupBuiltins(): BuiltinGroup[] {
  const order: Array<BuiltinWallpaper["platform"]> = ["windows", "macos"];
  return order
    .map((platform) => {
      const versions: BuiltinGroup["versions"] = [];
      for (const item of BUILTIN_WALLPAPERS) {
        if (item.platform !== platform) continue;
        const group = versions.find((v) => v.version === item.version);
        if (group) group.items.push(item);
        else versions.push({ version: item.version, items: [item] });
      }
      return { platform, versions };
    })
    .filter((g) => g.versions.length > 0);
}
