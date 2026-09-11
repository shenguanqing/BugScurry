import { BASE_SPEED } from "./config";
import { Rng, randomSeed } from "./rng";
import { getSpecies, pickSpeciesId } from "../species";
import type { Bug, Settings, Viewport } from "./types";

let nextId = 1;

export function createBug(
  viewport: Viewport,
  settings: Settings,
  rng: Rng = new Rng(randomSeed()),
): Bug {
  const margin = 56;
  const spawnAtEdge = rng.chance(0.5);
  const speciesId = pickSpeciesId(settings.species, () => rng.next());
  const species = getSpecies(speciesId);
  const traits = species?.traits;

  let x: number;
  let y: number;
  let heading: number;

  if (spawnAtEdge) {
    const side = rng.int(0, 3);
    if (side === 0) {
      x = rng.range(margin, viewport.width - margin);
      y = margin;
      heading = rng.range(0.15, Math.PI - 0.15);
    } else if (side === 1) {
      x = viewport.width - margin;
      y = rng.range(margin, viewport.height - margin);
      heading = rng.range(Math.PI / 2 + 0.15, (Math.PI * 3) / 2 - 0.15);
    } else if (side === 2) {
      x = rng.range(margin, viewport.width - margin);
      y = viewport.height - margin;
      heading = rng.range(Math.PI + 0.15, Math.PI * 2 - 0.15);
    } else {
      x = margin;
      y = rng.range(margin, viewport.height - margin);
      heading = rng.range(-Math.PI / 2 + 0.15, Math.PI / 2 - 0.15);
    }
  } else {
    x = rng.range(margin, viewport.width - margin);
    y = rng.range(margin, viewport.height - margin);
    heading = rng.range(0, Math.PI * 2);
  }

  const bodyScale = traits?.bodyScale ?? 1;
  const speedMul = traits?.speedMul ?? 1;
  const edgeAffinity = traits?.edgeAffinity ?? 0.5;

  return {
    id: `bug-${nextId++}`,
    species: speciesId,
    x,
    y,
    heading,
    speed: BASE_SPEED * settings.speed * speedMul * rng.range(0.82, 1.18),
    size: 15 * settings.size * bodyScale * rng.range(0.97, 1.03),
    state: "crawling",
    legPhase: rng.next(),
    stateTimer: rng.range(0.5, 2.2),
    deathProgress: 0,
    turnBias: rng.range(-0.3, 0.3),
    edgeAffinity: edgeAffinity * rng.range(0.85, 1.15),
    stuckTime: 0,
    seed: rng.next(),
  };
}
