import {
  BASE_SPEED,
  FAT_BUG_CHANCE,
  FAT_BUG_HP,
  FAT_BUG_SIZE_MAX,
  FAT_BUG_SIZE_MIN,
} from "./config";
import { PERSONALITIES } from "./personality";
import { Rng, randomSeed } from "./rng";
import { currentDayPhase } from "./weather";
import { getSpecies, listSpecies, pickSpeciesId } from "../species";
import type { Bug, Settings, Viewport } from "./types";

let nextId = 1;

export function createBug(
  viewport: Viewport,
  settings: Settings,
  rng: Rng = new Rng(randomSeed()),
): Bug {
  const margin = 56;
  const spawnAtEdge = rng.chance(0.5);
  const speciesId = pickSpeciesId(settings.species, () => rng.next(), currentDayPhase());
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
  const fat = rng.chance(FAT_BUG_CHANCE);
  const sizeMul = fat
    ? rng.range(FAT_BUG_SIZE_MIN, FAT_BUG_SIZE_MAX)
    : rng.range(0.97, 1.03);
  const fatSpeed = fat ? rng.range(0.55, 0.75) : 1;

  return {
    id: `bug-${nextId++}`,
    species: speciesId,
    x,
    y,
    heading,
    speed:
      BASE_SPEED * settings.speed * speedMul * rng.range(0.82, 1.18) * fatSpeed,
    size: 15 * settings.size * bodyScale * sizeMul,
    state: "crawling",
    legPhase: rng.next(),
    stateTimer: rng.range(0.5, 2.2),
    deathProgress: 0,
    turnBias: rng.range(-0.3, 0.3),
    edgeAffinity: edgeAffinity * rng.range(0.85, 1.15),
    stuckTime: 0,
    seed: rng.next(),
    hp: fat ? FAT_BUG_HP : 1,
    maxHp: fat ? FAT_BUG_HP : 1,
    hurtTimer: 0,
    personality: PERSONALITIES[rng.int(0, PERSONALITIES.length - 1)],
    eatingBaitId: null,
    enjoyingFood: false,
    foodCooldown: 0,
    satisfiedTimer: 0,
    carryKind: null,
    carryTimer: 0,
  };
}

/** Forced chonky invader: 3 HP, large, a bit slower. */
export function createFatBug(
  viewport: Viewport,
  settings: Settings,
  rng: Rng = new Rng(randomSeed()),
): Bug {
  const bug = createBug(viewport, settings, rng);
  const species = getSpecies(bug.species);
  const bodyScale = species?.traits.bodyScale ?? 1;
  bug.maxHp = FAT_BUG_HP;
  bug.hp = FAT_BUG_HP;
  bug.size = 15 * settings.size * bodyScale * rng.range(FAT_BUG_SIZE_MIN, FAT_BUG_SIZE_MAX);
  bug.speed *= rng.range(0.55, 0.75);
  return bug;
}

/** Nocturnal-only spawn for the night-raid event. */
export function createNocturnalBug(
  viewport: Viewport,
  settings: Settings,
  rng: Rng = new Rng(randomSeed()),
): Bug | null {
  const nocturnal = listSpecies().filter((s) => s.traits.activity === "nocturnal");
  if (nocturnal.length === 0) return null;
  const pick = nocturnal[rng.int(0, nocturnal.length - 1)].id;
  return createBug(viewport, { ...settings, species: pick }, rng);
}
