import { describe, expect, it } from "vitest";
import { createBug } from "../bug";
import { BugManager } from "../bugManager";
import { BAIT_LIFE, DEFAULT_SETTINGS, MAX_BAITS } from "../config";
import { selectBait, resolveEatPlan } from "../feeding";
import { updateBug, updateBugs } from "../movement";
import { PERSONALITIES } from "../personality";
import { Rng } from "../rng";
import type { Bait, Bug, FoodKind, Personality } from "../types";

const viewport = { width: 1000, height: 800, dpr: 1 };
const settings = { ...DEFAULT_SETTINGS, species: "ant", repellent: true };
function bug(personality: Personality = "curious"): Bug {
  return { ...createBug(viewport, settings, new Rng(12)), personality, x: 500, y: 400,
    heading: Math.PI, stateTimer: 10, turnBias: 0, edgeAffinity: 0.5, speed: 70, hp: 1, maxHp: 1,
    foodCooldown: 0, satisfiedTimer: 0, carryKind: null, carryTimer: 0 };
}
function food(kind: FoodKind, x = 600, y = 400): Bait {
  return { id: kind, kind, x, y, size: 10, life: BAIT_LIFE, maxLife: BAIT_LIFE };
}

describe("personality and feeding", () => {
  it("assigns stable personalities at spawn and keeps them through settings changes", () => {
    const personalities = new Set<Personality>();
    const rng = new Rng(735);
    for (let i = 0; i < 100; i++) personalities.add(createBug(viewport, settings, rng).personality);
    expect([...personalities].sort()).toEqual([...PERSONALITIES].sort());
    const manager = new BugManager(settings, viewport);
    const before = manager.list[0].personality;
    manager.applySettings({ ...settings, size: 1.5 });
    expect(manager.list[0].personality).toBe(before);
  });

  it("chooses a favorite over a somewhat closer snack, but ignores distant or expired food", () => {
    const ant = bug();
    const cookie = food("cookie", 560);
    const sugar = food("sugar", 600);
    expect(selectBait(ant, [cookie, sugar])).toBe(sugar);
    expect(selectBait(ant, [sugar, cookie])).toBe(sugar);
    sugar.life = 0;
    expect(selectBait(ant, [cookie, sugar])).toBe(cookie);
    expect(selectBait(ant, [food("sugar", 5000)])).toBeNull();
    const fly = { ...ant, species: "fly" };
    const fruit = food("fruit", 600);
    expect(selectBait(fly, [food("sugar", 580), fruit])).toBe(fruit);
  });

  it("lets each bug choose its own food in the same frame", () => {
    const ant = bug();
    const fly = { ...bug(), species: "fly" };
    const sugar = food("sugar", 505);
    const fruit = food("fruit", 495);
    updateBugs([ant, fly], 1 / 60, settings, viewport, null, [sugar, fruit]);
    expect(ant.eatingBaitId).toBe("sugar");
    expect(fly.eatingBaitId).toBe("fruit");
    expect(ant.enjoyingFood && fly.enjoyingFood).toBe(true);
  });

  it("makes shy bugs flee from farther away", () => {
    const shy = bug("shy");
    const greedy = bug("greedy");
    shy.state = greedy.state = "paused";
    const cursor = { x: 590, y: 400, inside: true };
    updateBug(shy, 1 / 60, settings, viewport, new Rng(4), cursor);
    updateBug(greedy, 1 / 60, settings, viewport, new Rng(4), cursor);
    expect(shy.state).toBe("crawling");
    expect(greedy.state).toBe("paused");
  });

  it("makes lazy bugs move more slowly and greedy bugs wake for food", () => {
    const lazy = bug("lazy");
    const greedy = bug("greedy");
    updateBug(lazy, 1 / 60, settings, viewport, new Rng(7));
    updateBug(greedy, 1 / 60, settings, viewport, new Rng(7));
    expect(Math.hypot(lazy.x - 500, lazy.y - 400)).toBeLessThan(Math.hypot(greedy.x - 500, greedy.y - 400) * 0.8);
    lazy.state = greedy.state = "paused";
    lazy.stateTimer = greedy.stateTimer = 5;
    updateBug(lazy, 1 / 60, settings, viewport, new Rng(9), null, food("sugar"));
    updateBug(greedy, 1 / 60, settings, viewport, new Rng(9), null, food("sugar"));
    expect(lazy.state).toBe("paused");
    expect(greedy.state).toBe("crawling");
  });

  it("makes curious bugs investigate a distant cursor, respecting the repellent toggle", () => {
    const curious = bug("curious");
    const off = { ...curious };
    const cursor = { x: 625, y: 400, inside: true };
    for (let i = 0; i < 40; i++) {
      updateBug(curious, 1 / 60, settings, viewport, new Rng(10), cursor);
      updateBug(off, 1 / 60, { ...settings, repellent: false }, viewport, new Rng(10), cursor);
    }
    expect(Math.cos(curious.heading)).toBeGreaterThan(0);
    expect(Math.cos(off.heading)).toBeLessThan(0);
  });

  it("interrupts eating to flee, clears the heart, and respects disabled repellent", () => {
    const b = bug("greedy");
    const sugar = food("sugar", 505);
    updateBug(b, 1 / 60, settings, viewport, new Rng(10), null, sugar);
    expect(b.enjoyingFood).toBe(true);
    const cursor = { x: 501, y: 400, inside: true };
    updateBug(b, 1 / 60, settings, viewport, new Rng(10), cursor, sugar);
    expect(b.eatingBaitId).toBeNull();
    expect(b.enjoyingFood).toBe(false);
    expect(b.state).toBe("crawling");
    updateBug(b, 1 / 60, { ...settings, repellent: false }, viewport, new Rng(10), cursor, sugar);
    expect(b.eatingBaitId).toBe("sugar");
  });

  it("caps food count, consumes only food being eaten, and clears snacks with bugs", () => {
    const manager = new BugManager(settings, viewport);
    for (let i = 0; i < MAX_BAITS + 1; i++) manager.dropBait(i % 2 ? "fruit" : "sugar");
    expect(manager.baitList).toHaveLength(MAX_BAITS);
    const [eaten, untouched] = manager.baitList;
    manager.list[0].eatingBaitId = eaten.id;
    manager.tick(1);
    expect(eaten.life).toBeCloseTo(BAIT_LIFE - 2.4);
    expect(untouched.life).toBeCloseTo(BAIT_LIFE - 1);
    manager.clear();
    expect(manager.baitList).toHaveLength(0);
  });

  it("gives lazy bugs longer random rests", () => {
    const lazy = bug("lazy");
    const curious = bug("curious");
    lazy.stateTimer = curious.stateTimer = 0;
    updateBug(lazy, 1 / 60, settings, viewport, new Rng(1));
    updateBug(curious, 1 / 60, settings, viewport, new Rng(1));
    expect(lazy.state).toBe("paused");
    expect(curious.state).toBe("paused");
    expect(lazy.stateTimer).toBeCloseTo(curious.stateTimer * 2);
  });

  it("does not respawn cleared bugs when feeding", () => {
    const manager = new BugManager(settings, viewport);
    manager.clear();
    manager.dropBait("fruit");
    manager.tick(1);
    expect(manager.list).toHaveLength(0);
  });

  it("keeps 50 bugs finite and in bounds with three competing foods", () => {
    const rng = new Rng(22);
    const bugs = Array.from({ length: 50 }, () => createBug(viewport, { ...settings, species: "random" }, rng));
    const snacks = [food("cookie", 100), food("sugar", 500), food("fruit", 900)];
    for (let frame = 0; frame < 300; frame++) updateBugs(bugs, 1 / 60, settings, viewport, null, snacks);
    for (const b of bugs) {
      expect(Number.isFinite(b.heading)).toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(viewport.width);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(viewport.height);
    }
  });

  it("lets shy bugs peck and bail while greedy bugs cling to the snack", () => {
    const shy = bug("shy");
    const greedy = bug("greedy");
    const sugar = food("sugar", 505);
    for (let i = 0; i < 45; i++) {
      updateBug(shy, 1 / 60, settings, viewport, new Rng(11), null, sugar);
      updateBug(greedy, 1 / 60, settings, viewport, new Rng(11), null, sugar);
    }
    // ~0.75s: shy hold is ~0.28s then cooldown — off the food.
    expect(shy.eatingBaitId).toBeNull();
    expect(shy.foodCooldown).toBeGreaterThan(0);
    expect(greedy.eatingBaitId).toBe("sugar");
  });

  it("stains a finished fruit snack and sparks cookie crumbs", () => {
    const manager = new BugManager(
      { ...settings, particles: true, stains: true },
      viewport,
    );
    manager.dropBait("fruit");
    const fruit = manager.baitList[0];
    manager.list[0].eatingBaitId = fruit.id;
    fruit.life = 0.05;
    manager.tick(0.2);
    expect(manager.stainList.some((s) => s.species === "__juice")).toBe(true);

    manager.dropBait("cookie");
    const cookie = manager.baitList[manager.baitList.length - 1];
    manager.list[0].eatingBaitId = cookie.id;
    manager.tick(0.2);
    expect(manager.particleList.length).toBeGreaterThan(0);
  });

  it("keeps a longer satisfied glow after a favorite snack", () => {
    const ant = bug(); // ant favorite = sugar
    const sugar = food("sugar", 505);
    updateBug(ant, 1 / 60, settings, viewport, new Rng(10), null, sugar);
    expect(ant.satisfiedTimer).toBeGreaterThan(0);
    const afterFavorite = ant.satisfiedTimer;
    const other = bug();
    const cookie = food("cookie", 505);
    updateBug(other, 1 / 60, settings, viewport, new Rng(10), null, cookie);
    expect(other.satisfiedTimer).toBeGreaterThan(0);
    expect(afterFavorite).toBeGreaterThan(other.satisfiedTimer);
  });

  it("lets ants haul a crumb toward cover after a peck", () => {
    const ant = { ...bug("shy"), species: "ant" };
    const sugar = food("sugar", 505);
    // Ant carry style ends the peck and starts a haul toward cover.
    for (let i = 0; i < 80; i++) {
      updateBug(ant, 1 / 60, settings, viewport, new Rng(12), null, sugar);
      if (ant.carryKind) break;
    }
    expect(ant.carryKind).toBe("sugar");
    expect(ant.carryTimer).toBeGreaterThan(0);
    // While hauling it should not sit on the snack.
    const x0 = ant.x;
    const y0 = ant.y;
    for (let i = 0; i < 30; i++) {
      updateBug(ant, 1 / 60, settings, viewport, new Rng(12), null, sugar);
    }
    expect(Math.hypot(ant.x - x0, ant.y - y0)).toBeGreaterThan(2);
    expect(ant.eatingBaitId).toBeNull();
  });

  it("resolves species eat plans on top of personality", () => {
    expect(resolveEatPlan("greedy", "carry").cling).toBe(false);
    expect(resolveEatPlan("greedy", "carry").carry).toBe(true);
    expect(resolveEatPlan("lazy", "hover").bob).toBe(true);
    expect(resolveEatPlan("curious", "wrap").cling).toBe(true);
    expect(resolveEatPlan("shy", "sip").hold).toBeLessThan(resolveEatPlan("shy", undefined).hold);
    expect(resolveEatPlan("greedy", "ripple").ripple).toBe(true);
  });
});
