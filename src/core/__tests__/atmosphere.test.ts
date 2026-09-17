import { describe, expect, it } from "vitest";
import { mistDensity, sandGust, sandTravel } from "../atmosphere";

describe("atmospheric fields", () => {
  it("tiles continuously on both axes without hard edges", () => {
    for (const seed of [17, 76, 135]) {
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        expect(mistDensity(0, u, seed)).toBeCloseTo(mistDensity(1, u, seed), 10);
        expect(mistDensity(u, 0, seed)).toBeCloseTo(mistDensity(u, 1, seed), 10);
        expect(Math.abs(mistDensity(0.99999, u, seed) - mistDensity(0.00001, u, seed))).toBeLessThan(0.001);
      }
    }
  });

  it("has bounded, spatially varied density rather than a uniform veil", () => {
    const values: number[] = [];
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) values.push(mistDensity(x / 30, y / 30, 17));
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
  });

  it("advects continuously in a stable direction even across long runtimes", () => {
    for (const time of [0, 1, 10, 100, 3600, 86400]) {
      const gust = sandGust(time);
      expect(gust).toBeGreaterThanOrEqual(0.32);
      expect(gust).toBeLessThanOrEqual(1);
      const delta = sandTravel(time + 0.001) - sandTravel(time);
      expect(delta).toBeGreaterThan(0);
      expect(delta / 0.001).toBeCloseTo(gust, 3);
    }
  });
});
