import { phaseActivityWeight } from "../core/weather";
import type { Bug, DayPhase, FoodKind } from "../core/types";

/** How a species sits with a snack (stacks on top of personality). */
export type SpeciesEatStyle =
  | "carry"
  | "hover"
  | "ripple"
  | "scurry"
  | "wrap"
  | "probe"
  | "sip"
  | "munch";

export interface SpeciesTraits {
  /** Playful food preference; new species can omit it for equal interest. */
  favoriteFood?: FoodKind;
  /** Day/night bias for random mixes; omit for anytime. */
  activity?: "diurnal" | "nocturnal";
  /** Species-specific nibble behavior; omit for personality-only. */
  eatStyle?: SpeciesEatStyle;
  /** Logical size multiplier; standard species use 1 for consistent sizing and hit areas. */
  bodyScale: number;
  /** Relative speed multiplier */
  speedMul: number;
  /** 0..1 edge preference */
  edgeAffinity: number;
  /** Particle/squish tint */
  tint: string;
  stainColor: string;
  /** Translucent fluid exposed under pressure; defaults to muted straw yellow. */
  fluidColor?: string;
  /** Matching wet highlight and thin liquid edge; colors may include alpha. */
  fluidHighlight?: string;
  fluidShadow?: string;
}

export interface Species {
  id: string;
  label: string;
  emoji: string;
  traits: SpeciesTraits;
  draw(ctx: CanvasRenderingContext2D, bug: Bug, alpha: number): void;
}

const registry = new Map<string, Species>();

export function registerSpecies(species: Species): void {
  registry.set(species.id, species);
}

export function getSpecies(id: string): Species | undefined {
  return registry.get(id);
}

export function listSpecies(): Species[] {
  return [...registry.values()];
}

export function pickSpeciesId(
  preferred: string,
  rng: () => number,
  phase?: DayPhase,
): string {
  if (preferred && preferred !== "random" && registry.has(preferred)) {
    return preferred;
  }
  const entries = [...registry.entries()];
  if (entries.length === 0) return "cockroach";
  if (!phase) {
    return entries[Math.floor(rng() * entries.length) % entries.length][0];
  }
  const weighted = entries.map(([id, s]) => ({
    id,
    w: phaseActivityWeight(s.traits.activity, phase),
  }));
  const total = weighted.reduce((sum, e) => sum + e.w, 0);
  let roll = rng() * total;
  for (const e of weighted) {
    roll -= e.w;
    if (roll <= 0) return e.id;
  }
  return weighted[weighted.length - 1].id;
}
