<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { emit } from "@tauri-apps/api/event";
import { ensureAudio, playHurtSound, playSprayHiss, playSquishSound } from "./core/audio";
import { DEFAULT_SETTINGS, EVENT_BANNER, PRANK } from "./core/config";
import { BugManager, emptyDailyStats } from "./core/bugManager";
import { hitTestBug } from "./core/hitTest";
import { createLoop } from "./core/loop";
import type { CursorState, Settings, Viewport } from "./core/types";
import {
  fitWindowToDisplay,
  forceRebuildOverlays,
  listenCursorLocal,
  listenDisplaysChanged,
  listenSystemResumed,
  listenTray,
  listenKillReports,
  reportKill,
  setCursorPollerEnabled,
  setOverlayClickable,
  setTrayStats,
  setTrayRain,
  setTraySpray,
  listenRandomEvent,
} from "./services/tauriBridge";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  applyMonitorMode,
  applyUiLocale,
  listenOverlayCommands,
  listenSettings,
  loadDailyStats,
  loadSettings,
  openSettingsWindow,
  saveDailyStats,
  saveSettings,
} from "./services/settingsService";
import { createDailyStatsService } from "./services/dailyStatsService";
import { stopRainAudio, tickRainAudio } from "./core/rainAudio";
import {
  createAutoRainClock,
  pickRainWind,
  rainTrayAction,
  resetAutoRainClock,
  rollShower,
  tickAutoRain,
} from "./core/weather";
import {
  applyRandomEventToManager,
  createAutoEventClock,
  eventBannerMs,
  eventBusyMs,
  rearmAfterEvent,
  resetAutoEventClock,
  rollRandomEvent,
  tickAutoEvent,
  type AutoEventClock,
} from "./core/randomEvents";
import type { RainKind, RandomEventKind } from "./core/types";
import { t } from "./i18n";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const viewport = ref<Viewport>({ width: 1440, height: 900, dpr: 1 });
const visible = ref(true);
/** Match Rust startup: ignore_cursor_events(true) until a hover hit. */
const clickable = ref(false);

let manager: BugManager | null = null;
let loop: ReturnType<typeof createLoop> | null = null;
let unlistenCursor: (() => void) | null = null;
let unlistenDisplays: (() => void) | null = null;
let unlistenSystemResumed: (() => void) | null = null;
let unlistenTray: (() => void) | null = null;
/** Debounce wake recovery — sleep/wake can emit more than once. */
let resumeHoldUntil = 0;
let unlistenSettings: (() => void) | null = null;
let unlistenCommands: (() => void) | null = null;
let clickableFlag = false;
let hoverHoldUntil = 0;
const cursorState: CursorState = { x: 0, y: 0, inside: false };
let unlistenKills: (() => void) | null = null;
let dailyStatsService: ReturnType<typeof createDailyStatsService> | null = null;
let autoRainClock = createAutoRainClock(performance.now(), false);
let autoRainTimer = 0;
let autoEventClock: AutoEventClock = createAutoEventClock(performance.now());
let autoEventTimer = 0;
let unlistenRandomEvent: (() => void) | null = null;
/** Primary overlay owns the tray spray cooldown countdown. */
let sprayReadyAt = 0;
let sprayTickTimer = 0;

/** Full-screen event title — never captures clicks. */
const bannerVisible = ref(false);
const bannerTitle = ref("");
const bannerSub = ref("");

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const vp = viewport.value;
  canvas.width = Math.floor(vp.width * vp.dpr);
  canvas.height = Math.floor(vp.height * vp.dpr);
  canvas.style.width = `${vp.width}px`;
  canvas.style.height = `${vp.height}px`;
}

function refreshViewportSync() {
  const width = window.innerWidth || document.documentElement.clientWidth || 1440;
  const height = window.innerHeight || document.documentElement.clientHeight || 900;
  const dpr = window.devicePixelRatio || 1;
  viewport.value = { width, height, dpr };
  resizeCanvas();
  manager?.setViewport(viewport.value);
}

async function refreshViewport() {
  refreshViewportSync();
  try {
    const fitted = await fitWindowToDisplay();
    viewport.value = fitted;
    resizeCanvas();
    manager?.setViewport(fitted);
  } catch {
    // keep sync values
  }
}

function setClickable(next: boolean) {
  if (clickableFlag === next) return;
  clickableFlag = next;
  clickable.value = next;
  void setOverlayClickable(next);
}

function applySettings(next: Settings) {
  const prev = settings.value;
  settings.value = next;
  manager?.applySettings(next);
  // Each WebView has its own localeRef — keep banner / future overlay copy in sync.
  if (prev.locale !== next.locale) {
    void applyUiLocale(next.locale);
  }
  if (prev.rain && !next.rain) stopRainAudio();
  if (prev.sound && !next.sound) stopRainAudio();
  if (
    isPrimaryOverlay() &&
    (prev.rain !== next.rain || prev.autoRain !== next.autoRain)
  ) {
    resetAutoRainClock(
      autoRainClock,
      performance.now(),
      next.rain,
      Math.random,
      next.rainKind,
    );
  }
  if (isPrimaryOverlay() && prev.randomEvents !== next.randomEvents) {
    resetAutoEventClock(autoEventClock, performance.now(), Math.random);
  }
}

function cooldownSecLeft(readyAt: number, now = performance.now()): number {
  const ms = readyAt - now;
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

async function syncSprayTray() {
  if (!isPrimaryOverlay()) return;
  await setTraySpray(cooldownSecLeft(sprayReadyAt));
}

/** Keep the spray tray label counting down until it is ready again. */
function ensureSprayTick() {
  if (!isPrimaryOverlay() || sprayTickTimer) return;
  sprayTickTimer = window.setInterval(() => {
    if (performance.now() >= sprayReadyAt) {
      window.clearInterval(sprayTickTimer);
      sprayTickTimer = 0;
      void syncSprayTray();
      return;
    }
    void syncSprayTray();
  }, 1000);
}

function runSpray() {
  if (!manager || !visible.value) return;
  const now = performance.now();
  if (now < sprayReadyAt) return;
  ensureAudio();
  const results = manager.sprayKillAll(now);
  if (settings.value.sound) playSprayHiss();
  for (const result of results) {
    void reportKill({ date: emptyDailyStats().date, combo: result.combo })
      .catch((err) => console.error("report kill failed", err));
  }
  if (isPrimaryOverlay()) {
    sprayReadyAt = now + PRANK.sprayCooldownSec * 1000;
    void syncSprayTray();
    ensureSprayTick();
  }
}

/** Settings → Random events: auto-roll chaos. Swarm cannot stack on itself. */
function canRunRandomEvent(kind: RandomEventKind): boolean {
  if (!manager || !visible.value) return false;
  if (kind === "swarm" && manager.isSwarmActive) return false;
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function applyRandomEvent(kind: RandomEventKind): void {
  if (!manager) return;
  applyRandomEventToManager(manager, kind, performance.now());
}

/**
 * PvZ-style warning: the title plays out and fades away first,
 * then the event starts. pointer-events:none so clicks still work.
 */
async function runEventAnnounce(kind: RandomEventKind): Promise<void> {
  bannerTitle.value = t(`event.${kind}.title`);
  bannerSub.value = t(`event.${kind}.subtitle`);
  bannerVisible.value = true;
  await delay(EVENT_BANNER.showMs);
  bannerVisible.value = false;
  await delay(EVENT_BANNER.hideMs);
  applyRandomEvent(kind);
}

async function fireRandomEvent(kind: RandomEventKind): Promise<void> {
  if (!canRunRandomEvent(kind)) return;
  await runEventAnnounce(kind);
}

function commitRain(patch: Partial<Settings> & { rain: boolean }) {
  const next: Settings = { ...settings.value, ...patch };
  settings.value = next;
  void saveSettings(next);
  // Cut audio immediately — the rAF loop may be paused while bugs are hidden.
  if (!next.rain) stopRainAudio();
  void setTrayRain(next.rain, next.rain ? next.rainKind : null);
  if (isPrimaryOverlay()) {
    resetAutoRainClock(
      autoRainClock,
      performance.now(),
      next.rain,
      Math.random,
      next.rainKind,
    );
  }
}

function stopRain() {
  if (!settings.value.rain) return;
  commitRain({ rain: false });
}

/** Start a shower: a fixed kind, or "random" to roll strength + wind. */
function startRain(kind: RainKind | "random") {
  const shower =
    kind === "random" ? rollShower() : { kind, wind: pickRainWind() };
  commitRain({ rain: true, rainKind: shower.kind, rainWind: shower.wind });
  ensureAudio();
}

function applyRainTrayCommand(cmd: string): boolean {
  const action = rainTrayAction(cmd);
  if (!action) return false;
  if (action.mode === "off") stopRain();
  else startRain(action.kind);
  return true;
}

function onPointerMove(ev: PointerEvent) {
  cursorState.x = ev.clientX;
  cursorState.y = ev.clientY;
}

function onPointerDown(ev: PointerEvent) {
  if (!manager) return;
  cursorState.x = ev.clientX;
  cursorState.y = ev.clientY;
  ensureAudio();
  const target = hitTestBug(manager.list, ev.clientX, ev.clientY, viewport.value);
  if (!target) return;
  const result = manager.hit(target);
  if (result.kind === "killed") {
    if (settings.value.sound) playSquishSound(result.combo);
    void reportKill({ date: emptyDailyStats().date, combo: result.combo })
      .catch((err) => console.error("report kill failed", err));
  } else if (result.kind === "hurt") {
    if (settings.value.sound) playHurtSound();
  }
  hoverHoldUntil = performance.now() + 400;
  setClickable(true);
}

function isPrimaryOverlay(): boolean {
  try {
    return getCurrentWindow().label === "overlay";
  } catch {
    return true;
  }
}

/** Stop rAF + cursor polling while bugs are hidden; restore on show. */
function applyVisibility(show: boolean) {
  if (!manager) return;
  visible.value = show;
  manager.setVisible(show);
  if (show) {
    loop?.start();
    if (isPrimaryOverlay()) void setCursorPollerEnabled(true);
  } else {
    loop?.stop();
    setClickable(false);
    stopRainAudio();
    if (isPrimaryOverlay()) void setCursorPollerEnabled(false);
  }
}

/**
 * Sleep → wake: secondary overlay WebViews can be zombies (blank / stale
 * geometry). Re-configuring existing windows is not enough — force a
 * close+recreate, the same path as toggling monitor mode in settings.
 */
async function rebuildOverlaysAfterWake(settleMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  try {
    await forceRebuildOverlays(settings.value.monitorMode);
  } catch (err) {
    console.error("wake overlay rebuild failed", err);
  }
}

async function recoverFromSystemResume() {
  const now = performance.now();
  if (now < resumeHoldUntil) return;
  // Cover two rebuild attempts.
  resumeHoldUntil = now + 4000;

  if (isPrimaryOverlay()) {
    // First pass quickly; second pass after displays finish enumerating.
    await rebuildOverlaysAfterWake(250);
    await rebuildOverlaysAfterWake(1100);
  }
  await refreshViewport();
  resizeCanvas();
  ensureAudio();
}

function handleTray(cmd: string) {
  if (!manager) return;
  switch (cmd) {
    case "toggle_visibility":
      applyVisibility(!visible.value);
      break;
    case "add_one": {
      manager.addOne();
      const next = { ...settings.value, count: manager.list.length };
      settings.value = next;
      void saveSettings(next);
      break;
    }
    case "remove_one": {
      manager.removeOne();
      const next = { ...settings.value, count: Math.max(1, manager.list.length) };
      settings.value = next;
      void saveSettings(next);
      break;
    }
    case "regenerate":
      manager.regenerate();
      break;
    case "drop_bait":
      manager.dropBait("cookie");
      break;
    case "drop_sugar":
      manager.dropBait("sugar");
      break;
    case "drop_fruit":
      manager.dropBait("fruit");
      break;
    case "prank_spray":
      runSpray();
      break;
    case "open_settings":
      void openSettingsWindow();
      break;
    default:
      applyRainTrayCommand(cmd);
      break;
  }
}

onMounted(async () => {
  await refreshViewport();
  const loaded = await loadSettings();
  settings.value = loaded;
  await applyUiLocale(loaded.locale);
  const daily = await loadDailyStats();
  manager = new BugManager(loaded, viewport.value, daily ?? undefined);
  resizeCanvas();
  if (isPrimaryOverlay()) {
    dailyStatsService = createDailyStatsService(
      manager.dailyStats,
      saveDailyStats,
      (stats) => setTrayStats(stats.kills, stats.bestCombo),
    );
    unlistenKills = await listenKillReports((report) => {
      void dailyStatsService?.record(report)
        .catch((err) => console.error("save daily stats failed", err));
    });
    await dailyStatsService.refresh();
    void setTrayRain(loaded.rain, loaded.rain ? loaded.rainKind : null);
    void syncSprayTray();
    autoRainClock = createAutoRainClock(performance.now(), loaded.rain, Math.random, loaded.rainKind);
    autoRainTimer = window.setInterval(() => {
      if (!settings.value.autoRain) return;
      const nextRain = tickAutoRain(
        autoRainClock,
        performance.now(),
        settings.value.rain,
        Math.random,
      );
      if (nextRain !== settings.value.rain) {
        if (nextRain) startRain("random");
        else stopRain();
      }
    }, 2000);
    autoEventClock = createAutoEventClock(performance.now(), Math.random);
    autoEventTimer = window.setInterval(() => {
      if (!settings.value.randomEvents) return;
      const now = performance.now();
      if (!tickAutoEvent(autoEventClock, now)) return;
      const kind = rollRandomEvent(Math.random);
      if (!canRunRandomEvent(kind)) {
        // Hidden / busy — try again shortly instead of burning the whole gap.
        autoEventClock.dueAtMs = now + 5_000;
        return;
      }
      // Every overlay (including this one) banners + starts via the listener.
      void emit("random-event", { kind });
      rearmAfterEvent(
        autoEventClock,
        now,
        eventBannerMs() + eventBusyMs(kind),
        Math.random,
      );
    }, 2000);
  }

  // Every display banners + applies its own copy of the event.
  unlistenRandomEvent = await listenRandomEvent(async (kind) => {
    await fireRandomEvent(kind);
  });

  try {
    const label = getCurrentWindow().label;
    if (label === "overlay") {
      await applyMonitorMode(loaded.monitorMode);
      window.setTimeout(() => {
        refreshViewportSync();
      }, 120);
    }
  } catch {
    // ignore
  }

  loop = createLoop({
    manager,
    getSettings: () => settings.value,
    getViewport: () => viewport.value,
    getCanvas: () => canvasRef.value,
    getCursor: () => cursorState,
    onFrame: (timeSec, s, show) => {
      if (!isPrimaryOverlay()) return;
      tickRainAudio(s, timeSec, show);
    },
  });
  loop.start();

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("resize", refreshViewportSync);
  window.addEventListener("load", refreshViewportSync);

  unlistenCursor = await listenCursorLocal((pos) => {
    if (!manager) return;
    cursorState.x = pos.x;
    cursorState.y = pos.y;
    cursorState.inside = pos.inside;
    if (!cursorState.inside) {
      setClickable(false);
      return;
    }
    if (performance.now() < hoverHoldUntil) return;
    const hit = hitTestBug(manager.list, cursorState.x, cursorState.y, viewport.value);
    setClickable(!!hit);
  });

  unlistenTray = await listenTray((cmd) => handleTray(cmd));

  unlistenDisplays = await listenDisplaysChanged(async () => {
    if (!isPrimaryOverlay()) return;
    try {
      await applyMonitorMode(settings.value.monitorMode);
      window.setTimeout(() => {
        refreshViewportSync();
      }, 150);
    } catch (err) {
      console.error("re-apply monitor mode failed", err);
    }
  });

  unlistenSystemResumed = await listenSystemResumed(() => {
    void recoverFromSystemResume();
  });

  unlistenSettings = await listenSettings((next) => {
    applySettings(next);
  });

  unlistenCommands = await listenOverlayCommands((cmd) => {
    if (!manager) return;
    if (cmd === "clear") {
      manager.clear();
      // Clear the whole scene: bugs, snacks, stains — and stop rain streaks.
      if (isPrimaryOverlay()) stopRain();
    } else if (cmd === "regenerate") {
      manager.regenerate();
    } else if (cmd === "debug_rain_random") {
      if (isPrimaryOverlay()) startRain("random");
    } else if (cmd === "debug_rain_stop") {
      if (isPrimaryOverlay()) stopRain();
    } else if (cmd.startsWith("debug_weather:")) {
      if (isPrimaryOverlay()) {
        startRain(cmd.slice("debug_weather:".length) as RainKind);
      }
    } else if (cmd.startsWith("debug_event:")) {
      void fireRandomEvent(cmd.slice("debug_event:".length) as RandomEventKind);
    } else if (cmd === "debug_spray") {
      // Reuse the tray path so every display sprays.
      handleTray("prank_spray");
    }
  });
});

onUnmounted(() => {
  loop?.stop();
  window.clearInterval(autoRainTimer);
  window.clearInterval(autoEventTimer);
  window.clearInterval(sprayTickTimer);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("resize", refreshViewportSync);
  window.removeEventListener("load", refreshViewportSync);
  unlistenKills?.();
  unlistenCursor?.();
  unlistenDisplays?.();
  unlistenSystemResumed?.();
  unlistenTray?.();
  unlistenSettings?.();
  unlistenCommands?.();
  unlistenRandomEvent?.();
});
</script>

<template>
  <div class="overlay" :class="{ hidden: !visible, clickable }">
    <canvas ref="canvasRef" class="bugs-canvas" />
    <Transition name="event-banner">
      <div v-if="bannerVisible" class="event-banner" aria-live="polite">
        <div class="event-banner-veil" />
        <div class="event-banner-copy">
          <p class="event-banner-title">{{ bannerTitle }}</p>
          <p class="event-banner-sub">{{ bannerSub }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.overlay.clickable {
  pointer-events: auto;
}

.overlay.hidden {
  visibility: hidden;
}

.bugs-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
}

/* Never steal clicks from the desktop or bug hit-testing. */
.event-banner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
}

.event-banner-veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 55% at 50% 48%, rgba(40, 12, 8, 0.28), transparent 70%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.42) 50%, rgba(0, 0, 0, 0.18));
}

.event-banner-copy {
  position: relative;
  text-align: center;
  padding: 0 24px;
}

.event-banner-title {
  margin: 0;
  font-size: clamp(34px, 7.5vw, 64px);
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #fff8f0;
  text-shadow:
    0 0 24px rgba(255, 96, 48, 0.45),
    0 2px 18px rgba(0, 0, 0, 0.55),
    0 0 1px rgba(0, 0, 0, 0.8);
  animation: event-title-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.event-banner-sub {
  margin: 12px 0 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.28em;
  color: rgba(255, 236, 220, 0.78);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.5);
  animation: event-title-in 0.55s 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes event-title-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.event-banner-enter-active {
  transition: opacity 220ms ease;
}

.event-banner-leave-active {
  transition: opacity 380ms ease;
}

.event-banner-enter-from,
.event-banner-leave-to {
  opacity: 0;
}
</style>
