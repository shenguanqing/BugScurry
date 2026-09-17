import { createBug, createFatBug, createNocturnalBug } from "./bug";
import {
  BAIT_LIFE,
  COMBO_TEXT_LIFE,
  COMBO_WINDOW,
  LIMITS,
  MAX_BAITS,
  MAX_FLOATS,
  MAX_PARTICLES,
  MAX_STAINS,
  NIBBLE_FX_COOLDOWN,
  PRANK,
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
  FoodKind,
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
  private eatFxCool = 0;
  /** Spray mist remaining seconds; drives the top→bottom FX sweep. */
  private sprayFxLeft = 0;
  /** Swarm peak ends at this timestamp (ms); 0 = inactive. */
  private swarmPeakUntil = 0;
  /** Swarm fully ends at this timestamp (ms); 0 = inactive. */
  private swarmUntil = 0;
  private swarmPeak = 0;
  /** Temporary invader bugs (fat / night raid) — trimmed before normal bugs. */
  private invaders = new Set<string>();
  /** Speed-boost window end (ms); 0 = idle. */
  private berserkUntil = 0;
  /** Size-chaos window end (ms); 0 = idle. */
  private sizeChaosUntil = 0;
  /** Pre-chaos sizes so we can restore. */
  private sizeChaosBase = new Map<string, number>();

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

  /** Freshest food, if any (for inspection; movement considers all food). */
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

    // An explicit count change ends any prank swarm and converges to the user value.
    if (nextCount !== prevCount) {
      this.cancelSwarm();
      this.restoreSizeChaos();
      if (sizeRatio !== 1 && Number.isFinite(sizeRatio)) {
        for (const bug of this.bugs) {
          bug.size = Math.max(4, bug.size * sizeRatio);
        }
      }
      this.setBugCount(nextCount);
      return;
    }

    if (sizeRatio !== 1 && Number.isFinite(sizeRatio)) {
      this.restoreSizeChaos();
      for (const bug of this.bugs) {
        bug.size = Math.max(4, bug.size * sizeRatio);
      }
    }

    // Never auto-replace squished bugs when the user count is unchanged.
    // Swarm may only shrink toward its fall target; invaders are not auto-trimmed here.
    if (this.swarmUntil > 0) {
      const target = this.effectiveTargetCount(performance.now());
      if (target < this.bugs.length) this.setBugCount(target);
    } else {
      this.trimNormalBugsTo(nextCount);
    }
  }

  syncCount(): void {
    if (this.suppressed) return;
    const target = this.effectiveTargetCount(performance.now());
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
    this.trimBugsTo(target);
  }

  /** Shrink only non-invader bugs down to the configured count. */
  private trimNormalBugsTo(targetNormal: number): void {
    while (this.bugs.length - this.invaders.size > targetNormal) {
      const idx = this.bugs.findIndex((b) => !this.invaders.has(b.id));
      if (idx < 0) break;
      this.bugs.splice(idx, 1);
    }
  }

  addOne(): void {
    this.cancelSwarm();
    this.suppressed = false;
    const next = Math.min(LIMITS.countMax, Math.round(this.settings.count) + 1);
    this.settings = { ...this.settings, count: next };
    this.setBugCount(next);
  }

  removeOne(): void {
    if (this.settings.count <= 0 && this.bugs.length === 0) return;
    this.cancelSwarm();
    this.suppressed = false;
    const next = Math.max(0, Math.round(this.settings.count) - 1);
    this.settings = { ...this.settings, count: next };
    this.setBugCount(next);
  }

  clear(): void {
    this.cancelSwarm();
    this.restoreSizeChaos();
    this.berserkUntil = 0;
    this.invaders.clear();
    this.bugs = [];
    this.stains = [];
    this.particles = [];
    this.baits = [];
    this.floats = [];
    this.suppressed = true;
  }

  regenerate(): void {
    this.cancelSwarm();
    this.restoreSizeChaos();
    this.berserkUntil = 0;
    this.invaders.clear();
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

  /** Spray mist progress 0..1 while the FX plays; 0 when idle. */
  get sprayFxProgress(): number {
    if (this.sprayFxLeft <= 0) return 0;
    const elapsed = PRANK.sprayFxSec - this.sprayFxLeft;
    // Keep the first frame paintable (progress 0 would skip the mist).
    return Math.min(1, Math.max(0.02, elapsed / PRANK.sprayFxSec));
  }

  get isSwarmActive(): boolean {
    return this.swarmUntil > 0;
  }

  /** Live target count including an active prank swarm. */
  private effectiveTargetCount(nowMs: number): number {
    const base = Math.max(0, Math.round(this.settings.count));
    if (this.swarmUntil <= 0 || nowMs <= 0) return base;
    if (nowMs >= this.swarmUntil) {
      this.cancelSwarm();
      return base;
    }
    if (nowMs < this.swarmPeakUntil) return this.swarmPeak;
    const fall = Math.max(1, this.swarmUntil - this.swarmPeakUntil);
    const t = Math.min(1, Math.max(0, (nowMs - this.swarmPeakUntil) / fall));
    return Math.round(this.swarmPeak + (base - this.swarmPeak) * t);
  }

  cancelSwarm(): void {
    this.swarmPeakUntil = 0;
    this.swarmUntil = 0;
    this.swarmPeak = 0;
  }

  private setBugCount(target: number): void {
    this.suppressed = false;
    while (this.bugs.length < target) {
      this.bugs.push(createBug(this.viewport, this.settings));
    }
    this.trimBugsTo(target);
  }

  /** Drop invaders first so a count shrink does not eat the user's bugs. */
  private trimBugsTo(target: number): void {
    while (this.bugs.length > target) {
      const invIdx = this.bugs.findIndex((b) => this.invaders.has(b.id));
      if (invIdx >= 0) {
        this.invaders.delete(this.bugs[invIdx].id);
        this.sizeChaosBase.delete(this.bugs[invIdx].id);
        this.bugs.splice(invIdx, 1);
      } else {
        const last = this.bugs.pop();
        if (last) {
          this.invaders.delete(last.id);
          this.sizeChaosBase.delete(last.id);
        }
      }
    }
  }

  /**
   * Insecticide spray: every live bug dies on this screen.
   * Fat bugs are finished in one pass (no double-counted combo).
   */
  sprayKillAll(nowMs: number = performance.now()): Extract<
    HitResult,
    { kind: "killed" }
  >[] {
    const results: Extract<HitResult, { kind: "killed" }>[] = [];
    this.sprayFxLeft = PRANK.sprayFxSec;
    for (const bug of [...this.bugs]) {
      if (bug.state === "squishing" || bug.state === "dying") continue;
      let result = this.hit(bug, nowMs);
      while (result.kind === "hurt") {
        result = this.hit(bug, nowMs);
      }
      if (result.kind === "killed") results.push(result);
    }
    return results;
  }

  /** Temporarily raise live count; falls back to settings.count later. */
  startSwarm(nowMs: number = performance.now()): number {
    const base = Math.max(1, Math.round(this.settings.count));
    const target = Math.min(
      LIMITS.countMax,
      Math.max(base + PRANK.swarmBonus, base * PRANK.swarmMul),
    );
    this.swarmPeak = target;
    this.swarmPeakUntil = nowMs + PRANK.swarmPeakSec * 1000;
    this.swarmUntil = this.swarmPeakUntil + PRANK.swarmFallSec * 1000;
    this.setBugCount(target);
    return target;
  }

  /** Drop 5–7 fat invaders that stay until killed or trimmed. */
  startFatInvasion(rng: Rng = new Rng(randomSeed())): number {
    const n = rng.int(PRANK.fatInvasionMin, PRANK.fatInvasionMax);
    this.suppressed = false;
    for (let i = 0; i < n; i++) {
      if (this.bugs.length >= LIMITS.countMax) break;
      const bug = createFatBug(this.viewport, this.settings, rng);
      this.invaders.add(bug.id);
      this.bugs.push(bug);
    }
    return n;
  }

  /** Spawn nocturnal-only invaders (spider / mosquito / cockroach). */
  startNightRaid(rng: Rng = new Rng(randomSeed())): number {
    const n = rng.int(PRANK.nightRaidMin, PRANK.nightRaidMax);
    this.suppressed = false;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (this.bugs.length >= LIMITS.countMax) break;
      const bug = createNocturnalBug(this.viewport, this.settings, rng);
      if (!bug) break;
      this.invaders.add(bug.id);
      this.bugs.push(bug);
      spawned++;
    }
    return spawned;
  }

  /** All bugs sprint for a short window. */
  startBerserk(nowMs: number = performance.now()): void {
    if (this.berserkUntil > nowMs) {
      // Already raging — just extend.
      this.berserkUntil = nowMs + PRANK.berserkSec * 1000;
      return;
    }
    for (const bug of this.bugs) bug.speed *= PRANK.berserkMul;
    this.berserkUntil = nowMs + PRANK.berserkSec * 1000;
  }

  /** Randomly scale every bug for a short window, then restore. */
  startSizeChaos(nowMs: number = performance.now(), rng: Rng = new Rng(randomSeed())): void {
    this.restoreSizeChaos();
    for (const bug of this.bugs) {
      this.sizeChaosBase.set(bug.id, bug.size);
      bug.size *= rng.range(PRANK.sizeChaosMin, PRANK.sizeChaosMax);
    }
    this.sizeChaosUntil = nowMs + PRANK.sizeChaosSec * 1000;
  }

  private restoreSizeChaos(): void {
    for (const bug of this.bugs) {
      const base = this.sizeChaosBase.get(bug.id);
      if (base !== undefined) bug.size = base;
    }
    this.sizeChaosBase.clear();
    this.sizeChaosUntil = 0;
  }

  /** Advance spray FX, swarm fall-back, berserk and size chaos. */
  private tickPrank(dt: number, nowMs: number): void {
    if (this.sprayFxLeft > 0) {
      this.sprayFxLeft = Math.max(0, this.sprayFxLeft - dt);
    }
    if (this.swarmUntil > 0 && nowMs >= this.swarmUntil) {
      this.cancelSwarm();
      this.setBugCount(Math.max(0, Math.round(this.settings.count)));
    } else if (this.swarmUntil > 0 && nowMs >= this.swarmPeakUntil) {
      this.setBugCount(this.effectiveTargetCount(nowMs));
    }
    if (this.berserkUntil > 0 && nowMs >= this.berserkUntil) {
      for (const bug of this.bugs) bug.speed /= PRANK.berserkMul;
      this.berserkUntil = 0;
    }
    if (this.sizeChaosUntil > 0 && nowMs >= this.sizeChaosUntil) {
      this.restoreSizeChaos();
    }
  }

  dropBait(kind: FoodKind = "cookie"): Bait {
    const rng = new Rng(randomSeed());
    const margin = 48;
    const live = this.bugs.filter((bug) => bug.state === "crawling" || bug.state === "paused");
    const host = live.length ? live[rng.int(0, live.length - 1)] : null;
    const x = Math.max(margin, Math.min(this.viewport.width - margin,
      host ? host.x + rng.range(-100, 100) : rng.range(margin, this.viewport.width - margin)));
    const y = Math.max(margin, Math.min(this.viewport.height - margin,
      host ? host.y + rng.range(-100, 100) : rng.range(margin, this.viewport.height - margin)));
    const bait: Bait = {
      id: `bait-${this.effectId++}`,
      kind,
      x,
      y,
      size: rng.range(9, 12),
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
      let eater: Bug | null = null;
      for (const bug of this.bugs) {
        if (bug.state === "squishing" || bug.state === "dying") continue;
        if (bug.eatingBaitId === bait.id) {
          eater = bug;
          break;
        }
      }
      const nibbling = eater !== null;
      const before = bait.life;
      bait.life -= dt * (nibbling ? 2.4 : 1);
      if (nibbling && eater) this.spawnNibbleFx(eater, bait, dt);
      // Fruit finishes with a sticky juice blot on the desktop.
      if (before > 0 && bait.life <= 0 && nibbling && bait.kind === "fruit") {
        this.spawnJuiceBlot(bait);
      }
    }
    this.baits = this.baits.filter((b) => b.life > 0);

    for (const bug of this.bugs) {
      if (bug.hurtTimer > 0) bug.hurtTimer = Math.max(0, bug.hurtTimer - dt);
      updateSquish(bug, dt);
    }
    this.bugs = this.bugs.filter((b) => {
      if (isBugDead(b)) {
        this.invaders.delete(b.id);
        this.sizeChaosBase.delete(b.id);
        return false;
      }
      return true;
    });
  }

  tick(dt: number, nowMs: number = performance.now()): void {
    this.updateEffects(dt);
    this.tickPrank(dt, nowMs);
  }

  /** Cookie crumbs / sugar sparks / fruit drips while a bug is on a snack. */
  private spawnNibbleFx(eater: Bug, bait: Bait, dt: number): void {
    this.eatFxCool -= dt;
    if (this.eatFxCool > 0 || !this.settings.particles) return;
    this.eatFxCool = NIBBLE_FX_COOLDOWN;

    const rng = new Rng(randomSeed());
    // Emit from the contact point between mouth and snack.
    const mx = (eater.x + bait.x) * 0.5;
    const my = (eater.y + bait.y) * 0.5 - 2;
    const n = 1 + (rng.next() > 0.55 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + rng.range(-0.9, 0.9);
      const sp = 8 + rng.next() * 14;
      const life = rng.range(0.25, 0.45);
      const kind = bait.kind;
      const color =
        kind === "cookie"
          ? rng.next() > 0.5
            ? "#c9a66b"
            : "#a8844a"
          : kind === "sugar"
            ? rng.next() > 0.5
              ? "#ffffff"
              : "#e8f0ff"
            : rng.next() > 0.5
              ? "#f25f6b"
              : "#ff8a96";
      this.particles.push({
        x: mx + rng.range(-3, 3),
        y: my,
        vx: Math.cos(ang) * sp * rng.range(0.4, 1),
        vy: Math.sin(ang) * sp,
        life,
        maxLife: life,
        size: kind === "sugar" ? rng.range(0.6, 1.1) : rng.range(0.9, 1.6),
        color,
      });
    }
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  /** Short-lived sticky blot where a fruit snack vanished. */
  private spawnJuiceBlot(bait: Bait): void {
    if (!this.settings.stains) return;
    this.stains.push({
      id: `juice-${this.effectId++}`,
      heading: 0,
      x: bait.x,
      y: bait.y + 2,
      size: bait.size * 1.35,
      life: 2.4,
      maxLife: 2.4,
      species: "__juice",
    });
    if (this.stains.length > MAX_STAINS) this.stains.shift();
  }
}
