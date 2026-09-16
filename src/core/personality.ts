import type { Personality } from "./types";

export const PERSONALITIES: readonly Personality[] = ["shy", "greedy", "lazy", "curious"];

export const PERSONALITY_TRAITS = {
  shy: { fleeRadius: 1.6, speed: 1.05, pause: 0.8, appetite: 0.85 },
  greedy: { fleeRadius: 0.8, speed: 1, pause: 0.75, appetite: 1.5 },
  lazy: { fleeRadius: 1, speed: 0.65, pause: 2, appetite: 0.8 },
  curious: { fleeRadius: 1, speed: 1, pause: 1, appetite: 1.15 },
} satisfies Record<Personality, { fleeRadius: number; speed: number; pause: number; appetite: number }>;

/**
 * How each personality sits with a snack.
 * cling = keep topping the nibble timer while still in range.
 * cooldown = after leaving, wait this long before another peck.
 */
export const EAT_STYLES = {
  shy: { hold: 0.22, cooldown: 0.85, cling: false },
  greedy: { hold: 1.35, cooldown: 0, cling: true },
  lazy: { hold: 2.3, cooldown: 0, cling: true },
  curious: { hold: 0.38, cooldown: 0.28, cling: false },
} satisfies Record<
  Personality,
  { hold: number; cooldown: number; cling: boolean }
>;
