import { LIMITS } from "../core/config";
import { RAIN_KIND_ORDER } from "../core/weather";
import { getSpecies } from "../species";
import type { RainKind } from "../core/types";

/**
 * Share-link overrides for the web demo (`?count=12&species=ant&weather=heavy`).
 * Pure parser: every value is validated/clamped, unknown values are dropped.
 * Applied ephemerally on top of stored settings — the link always reproduces
 * the scene but never rewrites storage.
 */
export interface ShareOverrides {
  count?: number;
  species?: string;
  rain?: boolean;
  rainKind?: RainKind;
}

export function parseShareParams(search: string): ShareOverrides {
  const out: ShareOverrides = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return out;
  }
  const count = params.get("count");
  if (count !== null) {
    const n = Math.floor(Number(count));
    if (Number.isFinite(n)) {
      out.count = Math.min(LIMITS.countMax, Math.max(LIMITS.countMin, n));
    }
  }
  const species = params.get("species")?.trim().toLowerCase();
  if (species && (species === "random" || getSpecies(species))) {
    out.species = species;
  }
  const weather = params.get("weather")?.trim().toLowerCase();
  if (weather === "off") {
    out.rain = false;
  } else if (
    weather &&
    (RAIN_KIND_ORDER as readonly string[]).includes(weather)
  ) {
    out.rain = true;
    out.rainKind = weather as RainKind;
  }
  return out;
}
