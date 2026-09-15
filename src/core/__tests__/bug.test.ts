import { describe, expect, it } from "vitest";
import { createBug } from "../bug";
import { DEFAULT_SETTINGS } from "../config";
import { Rng } from "../rng";
import type { Settings, Viewport } from "../types";
import { getSpecies, listSpecies, pickSpeciesId } from "../../species";

const viewport: Viewport = { width: 800, height: 600, dpr: 1 };
const settings: Settings = { ...DEFAULT_SETTINGS, count: 1, species: "random" };

describe("createBug", () => {
  it("spawns inside the viewport with a live state", () => {
    const rng = new Rng(1);
    const bug = createBug(viewport, settings, rng);
    expect(bug.x).toBeGreaterThan(0);
    expect(bug.x).toBeLessThan(viewport.width);
    expect(bug.y).toBeGreaterThan(0);
    expect(bug.y).toBeLessThan(viewport.height);
    expect(bug.state).toBe("crawling");
    expect(bug.size).toBeGreaterThan(0);
    expect(bug.speed).toBeGreaterThan(0);
  });

  it("respects a fixed species preference", () => {
    const bug = createBug(viewport, { ...settings, species: "ladybug" }, new Rng(4));
    expect(bug.species).toBe("ladybug");
  });

  it("applies species speed traits", () => {
    const ant = createBug(viewport, { ...settings, species: "ant" }, new Rng(8));
    const base = createBug(viewport, { ...settings, species: "cockroach" }, new Rng(8));
    expect(ant.speed).toBeGreaterThan(base.speed * 1.05);
  });
});

describe("species registry", () => {
  it("ships the built-in species", () => {
    const ids = listSpecies().map((s) => s.id).sort();
    expect(ids).toEqual([
      "ant",
      "bee",
      "butterfly",
      "caterpillar",
      "cockroach",
      "fly",
      "ladybug",
      "mosquito",
      "spider",
    ]);
  });

  it("each species has draw + required traits", () => {
    for (const s of listSpecies()) {
      expect(typeof s.draw).toBe("function");
      expect(s.traits.bodyScale).toBeGreaterThan(0);
      expect(s.traits.speedMul).toBeGreaterThan(0);
      expect(s.traits.tint).toMatch(/^#/);
      expect(s.traits.stainColor).toMatch(/^#/);
    }
  });

  it("pickSpeciesId honors a known id and falls back for random", () => {
    expect(pickSpeciesId("spider", () => 0)).toBe("spider");
    const picked = pickSpeciesId("random", () => 0.99);
    expect(getSpecies(picked)).toBeDefined();
  });
});
