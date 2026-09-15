import { createBug } from "./bug";
import {
  BAIT_LIFE,
  BAIT_NIBBLE_RADIUS,
  COMBO_TEXT_LIFE,
  COMBO_WINDOW,
  MAX_BAITS,
  MAX_FLOATS,
  MAX_PARTICLES,
  MAX_STAINS,
  STAIN_LIFE,
} from "./config";
import { isBugDead, startSquish, updateSquish } from "./squish";
import { Rng, randomSeed } from "./rng";
import { getSpecies } from "../species";
import type {
  Bait,
  Bug,
  DailyStats,
  FloatText,
  Particle,
  Settings,
  Stain,
  Viewport,
} from "./types";

export type HitResult =
  | { kind: "miss" }
  | { kind: "hurt"; hpLeft: number; combo: number }
  | { kind: "killed"; combo: number; fat: boolean };

function localDateId(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyDailyStats(): DailyStats {
  return { date: localDateId(), kills: 0, bestCombo: 0 };
}

export function normalizeDailyStats(raw: unknown): DailyStats {
  const empty = emptyDailyStats();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Partial<DailyStats>;
  if (r.date !== empty.date) return empty;
  return {
    date: empty.date,
    kills: Math.max(0, Math.floor(Number(r.kills) || 0)),
    bestCombo: Math.max(0, Math.floor(Number(r.bestCombo) || 0)),
  };
}

export class BugManager {
  private bugs: Bug[] = [];
  private stains: Stain[] = [];
  private particles: Particle[] = [];
  private baits: Bait[] = [];
  private floats: FloatText[] = [];
  private settings: Settings;
  private viewport: Viewport;
  private visible = true;
  private suppressed = false;
  private effectId = 1;
  private combo = 0;
  private lastKillAt = 0;
  private daily: DailyStats = emptyDailyStats();

  constructor(settings: Settings, viewport: Viewport, daily?: DailyStats) {
    this.settings = settings;
    this.viewport = viewport;
    if (daily) this.daily = normalizeDailyStats(daily);
    this.syncCount();
  }

  get list(): Bug[] {
    return this.bugs;
  }

  get stainList(): Stain[] {
    return this.stains;
  }

  get particleList(): Particle[] {
    return this.particles;
  }

  get baitList(): Bait[] {
    return this.baits;
  }

  get floatList(): FloatText[] {
    return this.floats;
  }

  get currentCombo(): number {
    return this.combo;
  }

  get dailyStats(): DailyStats {
    return { ...this.daily };
  }

  setDailyStats(stats: DailyStats): void {
    this.daily = normalizeDailyStats(stats);
  }

  /** Freshest crumb, if any — passed into movement as a heading bias. */
  get activeBait(): Bait | null {
    return this.baits.length > 0 ? this.baits[this.baits.length - 1] : null;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    for (const bug of this.bugs) {
      const pad = bug.size * 0.5;
      bug.x = Math.min(viewport.width - pad, Math.max(pad, bug.x));
      bug.y = Math.min(viewport.height - pad, Math.max(pad, bug.y));
    }
    for (const bait of this.baits) {
      bait.x = Math.min(viewport.width - 12, Math.max(12, bait.x));
      bait.y = Math.min(viewport.height - 12, Math.max(12, bait.y));
    }
  }

  applySettings(settings: Settings): void {
    const prev = this.settings;
    const speciesChanged = settings.species !== prev.species;
    const prevCount = Math.max(0, Math.round(prev.count));
    const nextCount = Math.max(0, Math.round(settings.count));
    const sizeRatio =
      prev.size > 0 && settings.size > 0 ? settings.size / prev.size : 1;
    this.settings = settings;
    if (!settings.particles) this.particles = [];

    if (speciesChanged) {
      this.suppressed = false;
      this.regenerate();
      return;
    }

    if (sizeRatio !== 1 && Number.isFinite(sizeRatio)) {
      for (const bug of this.bugs) {
        bug.size = Math.max(4, bug.size * sizeRatio);
      }
    }

    if (nextCount > prevCount) {
      this.suppressed = false;
      while (this.bugs.length < nextCount) {
        this.bugs.push(createBug(this.viewport, this.settings));
      }
    } else if (nextCount < this.bugs.length) {
      this.suppressed = false;
      while (this.bugs.length > nextCount) {
        this.bugs.pop();
      }
    }
  }

  syncCount(): void {
    if (this.suppressed) return;
    const target = Math.max(0, Math.round(this.settings.count));
    while (this.bugs.length > target) {
      this.bugs.pop();
    }
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
  }

  addOne(): void {
    this.suppressed = false;
    this.settings = { ...this.settings, count: this.settings.count + 1 };
    this.bugs.push(createBug(this.viewport, this.settings));
  }

  removeOne(): void {
    if (this.bugs.length === 0) return;
    this.suppressed = false;
    this.settings = { ...this.settings, count: Math.max(0, this.bugs.length - 1) };
    this.bugs.pop();
  }

  clear(): void {
    this.bugs = [];
    this.stains = [];
    this.particles = [];
    this.baits = [];
    this.floats = [];
    this.suppressed = true;
  }

  regenerate(): void {
    this.suppressed = false;
    this.bugs = [];
    this.stains = [];
    this.particles = [];
    this.baits = [];
    this.floats = [];
    const rng = new Rng(randomSeed());
    const target = Math.max(1, Math.round(this.settings.count));
    for (let i = 0; i < target; i++) {
      this.bugs.push(createBug(this.viewport, this.settings, rng));
    }
  }

  dropBait(): Bait {
    const rng = new Rng(randomSeed());
    const margin = 48;
    const x = rng.range(margin, Math.max(margin + 1, this.viewport.width - margin));
    const y = rng.range(margin, Math.max(margin + 1, this.viewport.height - margin));
    const bait: Bait = {
      id: `bait-${this.effectId++}`,
      x,
      y,
      size: rng.range(5, 7.5),
      life: BAIT_LIFE,
      maxLife: BAIT_LIFE,
    };
    this.baits.push(bait);
    while (this.baits.length > MAX_BAITS) this.baits.shift();
    return bait;
  }

  private pushFloat(x: number, y: number, text: string, tier: number): void {
    this.floats.push({
      id: `float-${this.effectId++}`,
      x,
      y,
      text,
      life: COMBO_TEXT_LIFE,
      maxLife: COMBO_TEXT_LIFE,
      tier,
    });
    while (this.floats.length > MAX_FLOATS) this.floats.shift();
  }

  private bumpCombo(nowMs: number): number {
    if (nowMs - this.lastKillAt <= COMBO_WINDOW * 1000) {
      this.combo += 1;
    } else {
      this.combo = 1;
    }
    this.lastKillAt = nowMs;
    this.daily.kills += 1;
    if (this.combo > this.daily.bestCombo) {
      this.daily.bestCombo = this.combo;
    }
    return this.combo;
  }

  private spawnKillBurst(bug: Bug, fat: boolean): void {
    const species = getSpecies(bug.species);
    const fluidColor = species?.traits.fluidColor ?? "#b3a45b";

    if (this.settings.stains) {
      this.stains.push({
        id: `stain-${this.effectId++}`,
        heading: bug.heading,
        x: bug.x,
        y: bug.y,
        size: bug.size * 0.95,
        life: STAIN_LIFE,
        maxLife: STAIN_LIFE,
        species: bug.species,
      });
      if (this.stains.length > MAX_STAINS) this.stains.shift();
    }

    if (this.settings.particles) {
      const rng = new Rng(randomSeed());
      const n = fat ? 14 + Math.floor(rng.next() * 6) : 6 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        const ang = rng.range(0, Math.PI * 2);
        const sp = bug.size * rng.range(fat ? 9 : 7, fat ? 14 : 11);
        const life = rng.range(0.45, fat ? 0.85 : 0.65);
        this.particles.push({
          x: bug.x + Math.cos(ang) * bug.size * 0.3,
          y: bug.y + Math.sin(ang) * bug.size * 0.3,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life,
          maxLife: life,
          size: Math.max(0.8, bug.size * rng.range(0.055, fat ? 0.12 : 0.085)),
          color: fluidColor,
        });
      }
      if (this.particles.length > MAX_PARTICLES) {
        this.particles.splice(0, this.particles.length - MAX_PARTICLES);
      }
    }
  }

  /**
   * Click on a bug. Fat bugs take 3 hits; only the last one kills.
   * Returns combo so the UI can pick a rising pitch.
   */
  hit(bug: Bug, nowMs: number = performance.now()): HitResult {
    if (bug.state === "squishing" || bug.state === "dying") {
      return { kind: "miss" };
    }

    const fat = bug.maxHp > 1;
    if (bug.hp > 1) {
      bug.hp -= 1;
      bug.hurtTimer = 0.18;
      // Small splash so each chip feels real.
      if (this.settings.particles) {
        const rng = new Rng(randomSeed());
        const species = getSpecies(bug.species);
        const fluidColor = species?.traits.fluidColor ?? "#b3a45b";
        for (let i = 0; i < 4; i++) {
          const ang = rng.range(0, Math.PI * 2);
          const life = rng.range(0.2, 0.35);
          this.particles.push({
            x: bug.x + Math.cos(ang) * bug.size * 0.2,
            y: bug.y + Math.sin(ang) * bug.size * 0.2,
            vx: Math.cos(ang) * bug.size * rng.range(4, 8),
            vy: Math.sin(ang) * bug.size * rng.range(4, 8),
            life,
            maxLife: life,
            size: Math.max(0.7, bug.size * 0.05),
            color: fluidColor,
          });
        }
        if (this.particles.length > MAX_PARTICLES) {
          this.particles.splice(0, this.particles.length - MAX_PARTICLES);
        }
      }
      return { kind: "hurt", hpLeft: bug.hp, combo: this.combo };
    }

    startSquish(bug);
    this.spawnKillBurst(bug, fat);
    const combo = this.bumpCombo(nowMs);
    if (combo >= 2) {
      this.pushFloat(bug.x, bug.y - bug.size * 0.6, `${combo}×`, Math.min(combo, 8));
    }
    if (fat) {
      this.pushFloat(bug.x, bug.y + bug.size * 0.2, "砰", 3);
    }
    return { kind: "killed", combo, fat };
  }

  /** Legacy one-shot path (tests / tray). */
  squish(bug: Bug): boolean {
    return this.hit(bug).kind === "killed";
  }

  private updateEffects(dt: number): void {
    for (const s of this.stains) s.life -= dt;
    this.stains = this.stains.filter((s) => s.life > 0);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.exp(-9 * dt);
      p.vx *= drag;
      p.vy *= drag;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floats) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const bait of this.baits) {
      let nibbling = false;
      for (const bug of this.bugs) {
        if (bug.state === "squishing" || bug.state === "dying") continue;
        if (Math.hypot(bug.x - bait.x, bug.y - bait.y) <= BAIT_NIBBLE_RADIUS) {
          nibbling = true;
          break;
        }
      }
      bait.life -= dt * (nibbling ? 2.4 : 1);
    }
    this.baits = this.baits.filter((b) => b.life > 0);

    for (const bug of this.bugs) {
      if (bug.hurtTimer > 0) bug.hurtTimer = Math.max(0, bug.hurtTimer - dt);
      updateSquish(bug, dt);
    }
    this.bugs = this.bugs.filter((b) => !isBugDead(b));
  }

  tick(dt: number): void {
    this.updateEffects(dt);
  }
}
