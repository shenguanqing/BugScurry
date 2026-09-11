import { describe, expect, it } from "vitest";
import { Rng } from "../rng";

describe("Rng", () => {
  it("is deterministic for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("returns values in [0, 1)", () => {
    const rng = new Rng(123456);
    for (let i = 0; i < 200; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range stays within bounds", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it("int stays inclusive of both ends over many samples", () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(rng.int(0, 3));
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(3)).toBe(true);
    for (const v of seen) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it("chance(0) is false and chance(1) is true", () => {
    const rng = new Rng(5);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });
});
