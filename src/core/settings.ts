import { DEFAULT_SETTINGS, LIMITS } from "./config";
import type { Settings } from "./types";

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
  next.autostart = !!next.autostart;
  next.monitorMode = next.monitorMode === "all" ? "all" : "primary";
  next.species = typeof next.species === "string" && next.species ? next.species : "random";
  next.theme = next.theme === "light" || next.theme === "dark" ? next.theme : "auto";
  next.locale =
    next.locale === "zh-CN" || next.locale === "en" ? next.locale : "auto";
  return next;
}
