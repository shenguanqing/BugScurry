import type { Bug } from "../core/types";

export interface SpeciesTraits {
  /** Relative body length factor */
  bodyScale: number;
  /** Relative speed multiplier */
  speedMul: number;
  /** 0..1 edge preference */
  edgeAffinity: number;
  /** Particle/squish tint */
  tint: string;
  stainColor: string;
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

export function pickSpeciesId(preferred: string, rng: () => number): string {
  if (preferred && preferred !== "random" && registry.has(preferred)) {
    return preferred;
  }
  const ids = [...registry.keys()];
  if (ids.length === 0) return "cockroach";
  return ids[Math.floor(rng() * ids.length) % ids.length];
}
