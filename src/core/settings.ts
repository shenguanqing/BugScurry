import { DEFAULT_SETTINGS, LIMITS } from "./config";
import type { RainKind, Settings } from "./types";

const RAIN_KINDS: readonly RainKind[] = [
  "light",
  "moderate",
  "heavy",
  "downpour",
  "thunder",
  "snow",
  "fog",
  "sand",
];


const HOTKEY_MODS = new Set(["cmd", "ctrl", "alt", "shift", "fn"]);
const HOTKEY_LIMIT = 8;

/** Structural validation only; unknown key codes are dropped at push time. */
function sanitizeCaptureHotkeys(
  input: Settings["captureHotkeys"],
): Settings["captureHotkeys"] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const list: Settings["captureHotkeys"] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const { name, mods, code } = entry as {
      name?: unknown;
      mods?: unknown;
      code?: unknown;
    };
    if (typeof mods !== "string" || typeof code !== "string" || !code) continue;
    if (mods.split("+").some((m) => m && !HOTKEY_MODS.has(m))) continue;
    const cleanName = typeof name === "string" ? name.trim().slice(0, 24) : "";
    const key = `${cleanName}+${mods}+${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ name: cleanName || undefined, mods, code });
    if (list.length >= HOTKEY_LIMIT) break;
  }
  return list;
}

export function clampSettings(input: Partial<Settings>): Settings {
  const next: Settings = { ...DEFAULT_SETTINGS, ...input };
  next.count = Math.min(LIMITS.countMax, Math.max(LIMITS.countMin, Math.round(next.count)));
  next.size = Math.min(LIMITS.sizeMax, Math.max(LIMITS.sizeMin, next.size));
  next.speed = Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, next.speed));
  next.randomness = Math.min(
    LIMITS.randomnessMax,
    Math.max(LIMITS.randomnessMin, next.randomness),
  );
  next.sound = !!next.sound;
  next.stains = !!next.stains;
  next.particles = !!next.particles;
  next.repellent = !!next.repellent;
  next.autostart = !!next.autostart;
  next.showInCaptures = next.showInCaptures === true;
  next.captureCompatibilityEnabled = next.captureCompatibilityEnabled === true;
  next.captureHotkeys = sanitizeCaptureHotkeys(next.captureHotkeys);
  next.rain = !!next.rain;
  next.autoRain = !!next.autoRain;
  next.randomEvents = !!next.randomEvents;
  next.rainKind = RAIN_KINDS.includes(next.rainKind) ? next.rainKind : "moderate";
  const wind = Number(next.rainWind);
  next.rainWind = Number.isFinite(wind) ? Math.min(1, Math.max(-1, wind)) : 0;
  next.monitorMode = next.monitorMode === "all" ? "all" : "primary";
  next.species = typeof next.species === "string" && next.species ? next.species : "random";
  next.theme = next.theme === "light" || next.theme === "dark" ? next.theme : "auto";
  next.locale =
    next.locale === "zh-CN" ||
    next.locale === "zh-TW" ||
    next.locale === "en" ||
    next.locale === "ja" ||
    next.locale === "ko"
      ? next.locale
      : "auto";
  return next;
}
