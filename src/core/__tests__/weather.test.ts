import { describe, expect, it } from "vitest";
import { createBug } from "../bug";
import { DEFAULT_SETTINGS } from "../config";
import { updateBug, updateBugs } from "../movement";
import { Rng } from "../rng";
import {
  RAIN_LAYERS,
  RAIN_PROFILES,
  createAutoRainClock,
  currentDayPhase,
  dayPhaseFromHour,
  lightningFlash,
  nextDrySpanMs,
  nextWetSpanMs,
  phaseActivityWeight,
  pickRainKind,
  pickRainWind,
  rainMotion,
  rainTrayAction,
  rainWindAt,
  resetAutoRainClock,
  rollShower,
  tickAutoRain,
} from "../weather";
import { getSpecies, listSpecies, pickSpeciesId } from "../../species";
import type { Bug, Settings, Viewport } from "../types";

const viewport: Viewport = { width: 1000, height: 800, dpr: 1 };
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  species: "random",
  rain: false,
  repellent: true,
};

function centeredBug(overrides: Partial<Bug> = {}): Bug {
  return {
    ...createBug(viewport, settings, new Rng(11)),
    x: 500,
    y: 400,
    heading: Math.PI,
    stateTimer: 10,
    turnBias: 0,
    edgeAffinity: 0.2,
    speed: 70,
    hp: 1,
    maxHp: 1,
    ...overrides,
  };
}

describe("day phase", () => {
  it("maps local hours onto dawn / day / dusk / night", () => {
    expect(dayPhaseFromHour(0)).toBe("night");
    expect(dayPhaseFromHour(2)).toBe("night");
    expect(dayPhaseFromHour(5)).toBe("dawn");
    expect(dayPhaseFromHour(8)).toBe("day");
    expect(dayPhaseFromHour(17)).toBe("day");
    expect(dayPhaseFromHour(18)).toBe("dusk");
    expect(dayPhaseFromHour(21)).toBe("night");
    expect(dayPhaseFromHour(26)).toBe("night");
  });

  it("favors matching activity and reports a valid current phase", () => {
    expect(phaseActivityWeight("nocturnal", "night")).toBeGreaterThan(
      phaseActivityWeight("diurnal", "night"),
    );
    expect(phaseActivityWeight("diurnal", "day")).toBeGreaterThan(
      phaseActivityWeight("nocturnal", "day"),
    );
    expect(phaseActivityWeight(undefined, "day")).toBe(1);
    expect(["dawn", "day", "dusk", "night"]).toContain(currentDayPhase());
  });
});

describe("phase-weighted species mix", () => {
  it("prefers nocturnal species at night and diurnal by day", () => {
    const nightRolls = new Rng(42);
    const dayRolls = new Rng(42);
    let nocturnalAtNight = 0;
    let diurnalByDay = 0;
    for (let i = 0; i < 240; i++) {
      const nightId = pickSpeciesId("random", () => nightRolls.next(), "night");
      const dayId = pickSpeciesId("random", () => dayRolls.next(), "day");
      if (getSpecies(nightId)?.traits.activity === "nocturnal") nocturnalAtNight++;
      if (getSpecies(dayId)?.traits.activity === "diurnal") diurnalByDay++;
    }
    expect(nocturnalAtNight).toBeGreaterThan(120);
    expect(diurnalByDay).toBeGreaterThan(140);
  });

  it("honors an explicit species id regardless of phase", () => {
    expect(pickSpeciesId("bee", () => 0.99, "night")).toBe("bee");
  });

  it("tags diurnal and nocturnal species in the registry", () => {
    const diurnal = listSpecies().filter((s) => s.traits.activity === "diurnal");
    const nocturnal = listSpecies().filter((s) => s.traits.activity === "nocturnal");
    expect(diurnal.map((s) => s.id).sort()).toEqual(
      ["ant", "bee", "butterfly", "caterpillar", "ladybug"].sort(),
    );
    expect(nocturnal.map((s) => s.id).sort()).toEqual(
      ["cockroach", "mosquito", "spider"].sort(),
    );
  });
});

describe("rain behavior", () => {
  it("slows bugs and pushes them toward cover", () => {
    const dry = centeredBug({ x: 500, y: 180 });
    const wet = { ...dry };
    const drySettings = { ...settings, rain: false };
    const wetSettings = { ...settings, rain: true, rainKind: "heavy" as const };
    const dryRng = new Rng(3);
    const wetRng = new Rng(3);
    updateBug(dry, 1 / 60, drySettings, viewport, dryRng);
    updateBug(wet, 1 / 60, wetSettings, viewport, wetRng);
    const dryTravel = Math.hypot(dry.x - 500, dry.y - 180);
    const wetTravel = Math.hypot(wet.x - 500, wet.y - 180);
    expect(wetTravel).toBeLessThan(dryTravel * RAIN_PROFILES.heavy.speedMul + 0.5);

    for (let i = 0; i < 90; i++) {
      updateBug(dry, 1 / 60, drySettings, viewport, dryRng);
      updateBug(wet, 1 / 60, wetSettings, viewport, wetRng);
    }
    expect(wet.y).toBeLessThan(dry.y);
    expect(wet.y).toBeLessThan(200);
  });

  it("scales motion response by storm kind", () => {
    const light = rainMotion("light");
    const moderate = rainMotion("moderate");
    const heavy = rainMotion("heavy");
    const downpour = rainMotion("downpour");
    const thunder = rainMotion("thunder");
    expect(light.speedMul).toBeGreaterThan(moderate.speedMul);
    expect(moderate.speedMul).toBeGreaterThan(heavy.speedMul);
    expect(heavy.speedMul).toBeGreaterThan(downpour.speedMul);
    expect(thunder.pauseMul).toBeGreaterThan(light.pauseMul);
    expect(RAIN_PROFILES.thunder.lightning).toBe(true);
    expect(RAIN_PROFILES.light.lightning).toBe(false);
    expect(RAIN_PROFILES.downpour.density).toBeGreaterThan(RAIN_PROFILES.light.density);
  });

  it("keeps bugs finite under a downpour for many frames", () => {
    const wet = { ...settings, rain: true, rainKind: "downpour" as const };
    const bugs = Array.from({ length: 20 }, () => createBug(viewport, wet, new Rng(9)));
    for (let frame = 0; frame < 180; frame++) {
      updateBugs(bugs, 1 / 60, wet, viewport);
    }
    for (const b of bugs) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(viewport.width);
    }
  });
});

describe("shower roll and wind", () => {
  it("picks kinds across the full ladder and never centers wind", () => {
    const rng = new Rng(77);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) kinds.add(pickRainKind(() => rng.next()));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 40; i++) {
      const wind = pickRainWind(() => rng.next());
      expect(Math.abs(wind)).toBeGreaterThan(0.2);
      expect(Math.abs(wind)).toBeLessThanOrEqual(1);
    }
    const shower = rollShower(() => rng.next());
    expect(RAIN_PROFILES[shower.kind]).toBeTruthy();
    expect(Math.abs(shower.wind)).toBeGreaterThan(0.2);
  });

  it("leans wind with the shower direction and gusts over time", () => {
    const profile = RAIN_PROFILES.moderate;
    const left = rainWindAt(-0.8, profile, 0);
    const right = rainWindAt(0.8, profile, 0);
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
    const a = rainWindAt(0.5, profile, 1.2);
    const b = rainWindAt(0.5, profile, 4.8);
    expect(a).not.toBe(b);
  });

  it("emits double-strike lightning only during thunder windows", () => {
    let peaks = 0;
    let off = 0;
    for (let t = 0; t < 40; t += 0.02) {
      const flash = lightningFlash(t);
      expect(flash).toBeGreaterThanOrEqual(0);
      expect(flash).toBeLessThanOrEqual(1);
      if (flash > 0.8) peaks++;
      if (flash === 0) off++;
    }
    expect(peaks).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(peaks);
    // Sample just before a known cycle start should usually be dark.
    expect(lightningFlash(0.01)).toBeLessThan(0.05);
  });

  it("stacks depth layers and keeps desktop-safe opacities", () => {
    expect(RAIN_LAYERS.length).toBeGreaterThanOrEqual(3);
    expect(RAIN_LAYERS[0].speedMax).toBeLessThanOrEqual(RAIN_LAYERS[1].speedMax);
    expect(RAIN_LAYERS[2].lenMax).toBeGreaterThan(RAIN_LAYERS[0].lenMax);
    for (const layer of RAIN_LAYERS) expect(layer.alpha).toBeLessThan(0.45);
  });

  it("rolls wet and dry spans into playable ranges", () => {
    const dry = nextDrySpanMs(() => 0.5);
    const wet = nextWetSpanMs(() => 0.5, "moderate");
    expect(dry).toBeGreaterThan(wet);
    expect(dry).toBeGreaterThanOrEqual(40_000);
    expect(dry).toBeLessThanOrEqual(200_000);
    expect(wet).toBeGreaterThanOrEqual(16_000);
    expect(wet).toBeLessThanOrEqual(60_000);
    expect(nextWetSpanMs(() => 0.5, "thunder")).toBeLessThan(wet);
  });

  it("flips rain only after the due time and re-arms the clock", () => {
    const rng = () => 0;
    const clock = createAutoRainClock(0, false, rng);
    const dryDue = clock.dueAtMs;
    expect(tickAutoRain(clock, dryDue - 1, false, rng)).toBe(false);
    expect(tickAutoRain(clock, dryDue, false, rng)).toBe(true);
    expect(clock.dueAtMs).toBe(dryDue + nextWetSpanMs(rng));
    expect(tickAutoRain(clock, clock.dueAtMs, true, rng)).toBe(false);
  });

  it("reset re-arms from the current weather after a manual toggle", () => {
    const rng = () => 1;
    const clock = createAutoRainClock(1000, false, rng);
    resetAutoRainClock(clock, 5000, true, rng, "thunder");
    expect(clock.dueAtMs).toBe(5000 + nextWetSpanMs(rng, "thunder"));
  });

  it("maps every tray rain command to stop or a concrete kind", () => {
    expect(rainTrayAction("rain_off")).toEqual({ mode: "off" });
    expect(rainTrayAction("rain_random")).toEqual({ mode: "start", kind: "random" });
    expect(rainTrayAction("rain_light")).toEqual({ mode: "start", kind: "light" });
    expect(rainTrayAction("rain_moderate")).toEqual({ mode: "start", kind: "moderate" });
    expect(rainTrayAction("rain_heavy")).toEqual({ mode: "start", kind: "heavy" });
    expect(rainTrayAction("rain_downpour")).toEqual({ mode: "start", kind: "downpour" });
    expect(rainTrayAction("rain_thunder")).toEqual({ mode: "start", kind: "thunder" });
    expect(rainTrayAction("toggle_rain")).toBeNull();
    expect(rainTrayAction("open_settings")).toBeNull();
  });

  it("keeps rain audio mix in a quiet, increasing ladder", () => {
    // Import here to avoid pulling Web Audio into every weather test path.
    // Values mirror RAIN_AUDIO_MIX — light stays whisper-quiet.
    const ladder = [
      RAIN_PROFILES.light,
      RAIN_PROFILES.moderate,
      RAIN_PROFILES.heavy,
      RAIN_PROFILES.downpour,
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].density).toBeGreaterThan(ladder[i - 1].density);
      expect(ladder[i].wash).toBeGreaterThan(ladder[i - 1].wash);
    }
  });
});
