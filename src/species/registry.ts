import type { Bug } from "../core/types";

export interface Species {
  id: string;
  label: string;
  /** Draw only; movement traits can be layered later. */
  draw(ctx: CanvasRenderingContext2D, bug: Bug): void;
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
