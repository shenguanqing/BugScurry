import { describe, expect, it } from "vitest";
import { parseShareParams } from "../webShare";

describe("web share params", () => {
  it("returns no overrides for empty or broken input", () => {
    expect(parseShareParams("")).toEqual({});
    expect(parseShareParams("?")).toEqual({});
  });

  it("clamps count into 1–50 and drops non-numbers", () => {
    expect(parseShareParams("?count=12")).toEqual({ count: 12 });
    expect(parseShareParams("?count=999")).toEqual({ count: 50 });
    expect(parseShareParams("?count=0")).toEqual({ count: 1 });
    expect(parseShareParams("?count=many")).toEqual({});
  });

  it("accepts known species ids and random, drops the rest", () => {
    expect(parseShareParams("?species=ant")).toEqual({ species: "ant" });
    expect(parseShareParams("?species=RANDOM")).toEqual({ species: "random" });
    expect(parseShareParams("?species=dragon")).toEqual({});
  });

  it("accepts weather kinds and off, drops the rest", () => {
    expect(parseShareParams("?weather=heavy")).toEqual({ rain: true, rainKind: "heavy" });
    expect(parseShareParams("?weather=snow")).toEqual({ rain: true, rainKind: "snow" });
    expect(parseShareParams("?weather=off")).toEqual({ rain: false });
    expect(parseShareParams("?weather=drizzle")).toEqual({});
  });

  it("combines independent params", () => {
    expect(parseShareParams("?count=8&species=bee&weather=fog")).toEqual({
      count: 8,
      species: "bee",
      rain: true,
      rainKind: "fog",
    });
  });
});
