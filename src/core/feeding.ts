import { getSpecies, type SpeciesEatStyle } from "../species";
import { BAIT_ATTRACT_RADIUS } from "./config";
import { EAT_STYLES, PERSONALITY_TRAITS } from "./personality";
import type { Bait, Bug, FoodKind, Personality } from "./types";

export function foodInterest(bug: Bug, kind: FoodKind): number {
  const favorite = getSpecies(bug.species)?.traits.favoriteFood;
  const preference = favorite ? (favorite === kind ? 1.5 : 0.65) : 1;
  return preference * PERSONALITY_TRAITS[bug.personality].appetite;
}

export function foodRadius(bug: Bug, bait: Bait): number {
  return BAIT_ATTRACT_RADIUS * foodInterest(bug, bait.kind);
}

/** Compare reachable snacks by preference and distance, without allocating per frame. */
export function selectBait(bug: Bug, baits: readonly Bait[]): Bait | null {
  let selected: Bait | null = null;
  let best = -Infinity;
  for (const bait of baits) {
    if (bait.life <= 0) continue;
    const distance = Math.hypot(bug.x - bait.x, bug.y - bait.y);
    if (distance > foodRadius(bug, bait)) continue;
    const score = foodInterest(bug, bait.kind) / (40 + distance);
    if (score > best) {
      best = score;
      selected = bait;
    }
  }
  return selected;
}

export interface EatPlan {
  hold: number;
  cooldown: number;
  cling: boolean;
  carry: boolean;
  bob: boolean;
  ripple: boolean;
  /** First contact hesitates before the real bite. */
  probe: boolean;
}

/**
 * Personality timing, then species flavor on top.
 * Species can shorten pecks, force cling, or add carry/hover/ripple reads.
 */
export function resolveEatPlan(
  personality: Personality,
  speciesEat: SpeciesEatStyle | undefined,
): EatPlan {
  const base = EAT_STYLES[personality];
  const plan: EatPlan = {
    hold: base.hold,
    cooldown: base.cooldown,
    cling: base.cling,
    carry: false,
    bob: false,
    ripple: false,
    probe: false,
  };
  switch (speciesEat) {
    case "carry":
      plan.hold *= 0.9;
      plan.cooldown = Math.max(plan.cooldown, 0.35);
      plan.cling = false;
      plan.carry = true;
      break;
    case "hover":
      plan.hold *= 1.2;
      plan.bob = true;
      break;
    case "ripple":
      plan.hold *= 1.35;
      plan.cling = true;
      plan.ripple = true;
      break;
    case "scurry":
      plan.hold = Math.min(plan.hold, 0.2);
      plan.cooldown = Math.max(plan.cooldown, 0.55);
      plan.cling = false;
      break;
    case "wrap":
      plan.hold *= 1.7;
      plan.cling = true;
      plan.cooldown = 0;
      break;
    case "probe":
      plan.cooldown = Math.max(plan.cooldown, 0.32);
      plan.probe = true;
      break;
    case "sip":
      plan.hold = Math.min(plan.hold, 0.18);
      plan.cooldown = Math.max(plan.cooldown, 0.4);
      plan.cling = false;
      break;
    case "munch":
    default:
      break;
  }
  return plan;
}
