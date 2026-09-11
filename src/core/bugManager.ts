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

    // Live-rescale existing bugs so the size slider feels instant.
    if (sizeRatio !== 1 && Number.isFinite(sizeRatio)) {
      for (const bug of this.bugs) {
        bug.size = Math.max(4, bug.size * sizeRatio);
      }
    }

    // Only explicit count edits change population.
    // Squished bugs stay dead — do not top-up back to `count`.
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
      const n = 6 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        const ang = rng.range(0, Math.PI * 2);
        const sp = bug.size * rng.range(7, 11);
        const life = rng.range(0.45, 0.65);
        this.particles.push({
          x: bug.x + Math.cos(ang) * bug.size * 0.3,
          y: bug.y + Math.sin(ang) * bug.size * 0.3,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life,
          maxLife: life,
          size: Math.max(0.8, bug.size * rng.range(0.055, 0.085)),
          color: fluidColor,
        });
      }
      if (this.particles.length > MAX_PARTICLES) {
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
      const drag = Math.exp(-9 * dt);
      p.vx *= drag;
      p.vy *= drag;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const bug of this.bugs) updateSquish(bug, dt);
    this.bugs = this.bugs.filter((b) => !isBugDead(b));
    // Intentionally no auto-replace: user can squish every bug; new ones
    // only appear via count increase, tray +, or 重新生成.
  }

  tick(dt: number): void {
    this.updateEffects(dt);
  }
}
