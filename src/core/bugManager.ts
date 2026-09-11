import { createBug } from "./bug";
import { isBugDead, startSquish, updateSquish } from "./squish";
import { Rng, randomSeed } from "./rng";
import type { Bug, Settings, Viewport } from "./types";

export class BugManager {
  private bugs: Bug[] = [];
  private settings: Settings;
  private viewport: Viewport;
  private visible = true;
  /** When true, do not auto-refill after clear. */
  private suppressed = false;

  constructor(settings: Settings, viewport: Viewport) {
    this.settings = settings;
    this.viewport = viewport;
    this.syncCount();
  }

  get list(): Bug[] {
    return this.bugs;
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
    this.settings = settings;
    this.suppressed = false;
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
    this.suppressed = true;
  }

  regenerate(): void {
    this.suppressed = false;
    this.bugs = [];
    const rng = new Rng(randomSeed());
    const target = Math.max(1, Math.round(this.settings.count));
    for (let i = 0; i < target; i++) {
      this.bugs.push(createBug(this.viewport, this.settings, rng));
    }
  }

  squish(bug: Bug): void {
    startSquish(bug);
  }

  updateEffects(dt: number): void {
    for (const bug of this.bugs) {
      updateSquish(bug, dt);
    }
    this.bugs = this.bugs.filter((b) => !isBugDead(b));
    if (this.suppressed) return;
    const target = Math.max(0, Math.round(this.settings.count));
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
  }
}
