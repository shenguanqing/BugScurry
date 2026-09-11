import { createBug } from "./bug";
import { MAX_PARTICLES, MAX_STAINS, STAIN_LIFE } from "./config";
import { isBugDead, startSquish, updateSquish } from "./squish";
import { Rng, randomSeed } from "./rng";
import { getSpecies } from "../species";
import type { Bug, Particle, Settings, Stain, Viewport } from "./types";

export class BugManager {
  private bugs: Bug[] = [];
  private stains: Stain[] = [];
  private particles: Particle[] = [];
  private settings: Settings;
  private viewport: Viewport;
  private visible = true;
  private suppressed = false;
  private effectId = 1;

  constructor(settings: Settings, viewport: Viewport) {
    this.settings = settings;
    this.viewport = viewport;
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
  }

  applySettings(settings: Settings): void {
    const prev = this.settings;
    const speciesChanged = settings.species !== prev.species;
    const countChanged = Math.round(settings.count) !== Math.round(prev.count);
    this.settings = settings;

    if (speciesChanged) {
      this.suppressed = false;
      this.regenerate();
      return;
    }

    // Only an explicit count change lifts "cleared" state.
    // Theme / sound / etc. must not respawn bugs after 全部清除.
    if (countChanged) {
      this.suppressed = false;
    }

    this.syncCount();
  }

  syncCount(): void {
    if (this.suppressed) return;
    const target = Math.max(0, Math.round(this.settings.count));
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
    while (this.bugs.length > target) {
      this.bugs.pop();
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
    this.suppressed = true;
  }

  regenerate(): void {
    this.suppressed = false;
    this.bugs = [];
    this.stains = [];
    this.particles = [];
    const rng = new Rng(randomSeed());
    const target = Math.max(1, Math.round(this.settings.count));
    for (let i = 0; i < target; i++) {
      this.bugs.push(createBug(this.viewport, this.settings, rng));
    }
  }

  squish(bug: Bug): boolean {
    if (bug.state === "squishing" || bug.state === "dying") return false;
    startSquish(bug);
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
      const n = 4 + Math.floor(rng.next() * 4);
      for (let i = 0; i < n; i++) {
        const ang = rng.range(0, Math.PI * 2);
        const sp = bug.size * rng.range(1.5, 3.5);
        const life = rng.range(0.22, 0.38);
        this.particles.push({
          x: bug.x,
          y: bug.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life,
          maxLife: life,
          size: bug.size * rng.range(0.025, 0.055),
          color: fluidColor,
        });
      }
      if (this.particles.length > MAX_PARTICLES * 2) {
        this.particles.splice(0, this.particles.length - MAX_PARTICLES);
      }
    }

    return true;
  }

  private updateEffects(dt: number): void {
    for (const s of this.stains) s.life -= dt;
    this.stains = this.stains.filter((s) => s.life > 0);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Friction on the desktop plane arrests the small fragments quickly.
      const drag = Math.exp(-14 * dt);
      p.vx *= drag;
      p.vy *= drag;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const bug of this.bugs) updateSquish(bug, dt);
    this.bugs = this.bugs.filter((b) => !isBugDead(b));

    if (this.suppressed) return;
    const target = Math.max(0, Math.round(this.settings.count));
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
  }

  tick(dt: number): void {
    this.updateEffects(dt);
  }
}
