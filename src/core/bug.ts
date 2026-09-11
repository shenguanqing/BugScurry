import { BASE_SPEED } from "./config";
import { Rng, randomSeed } from "./rng";
import type { Bug, Settings, Viewport } from "./types";

let nextId = 1;

export function createBug(
  viewport: Viewport,
  settings: Settings,
  rng: Rng = new Rng(randomSeed()),
): Bug {
  const margin = 56;
  const spawnAtEdge = rng.chance(0.5);

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

  return {
    id: `bug-${nextId++}`,
    species: "cockroach",
    x,
    y,
    heading,
    speed: BASE_SPEED * settings.speed * rng.range(0.82, 1.18),
    size: 15 * settings.size * rng.range(0.88, 1.12),
    state: "crawling",
    legPhase: rng.next(),
    stateTimer: rng.range(0.5, 2.2),
    deathProgress: 0,
    turnBias: rng.range(-0.3, 0.3),
    edgeAffinity: rng.range(0.25, 0.9),
    seed: rng.next(),
  };
}
