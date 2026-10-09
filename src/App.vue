<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { ensureAudio, playHurtSound, playSprayHiss, playSquishSound, unlockAudio } from "./core/audio";
import { DEFAULT_SETTINGS, EVENT_BANNER, PRANK, TOUCH_HIT_BONUS } from "./core/config";
import { BugManager, emptyDailyStats } from "./core/bugManager";
import { hitTestBug } from "./core/hitTest";
import { createLoop } from "./core/loop";
import type { CursorState, FoodKind, Settings, Viewport } from "./core/types";
import { RAIN_KIND_ORDER } from "./core/weather";
import {
  emitRandomEvent,
  fitWindowToDisplay,
  forceRebuildOverlays,
  listenCursorLocal,
  listenDisplaysChanged,
  listenSystemResumed,
  listenOverlayVisibility,
  listenTray,
  listenKillReports,
  reportKill,
  requestOverlayCursor,
  setOverlayClickable,
  setTrayStats,
  setTrayRain,
  setTraySpray,
  listenRandomEvent,
} from "./services/tauriBridge";
import { getWindowLabel, isTauri } from "./platform/desktop";
import {
  BACKDROP_SWATCHES,
  addBackdropImage,
  backdropStyle,
  loadBackdrop,
  removeBackdropImage,
  saveBackdrop,
  selectBackdropImage,
  type BackdropState,
} from "./services/webBackdrop";
import { parseShareParams } from "./services/webShare";
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
let unlistenVisibility: (() => void) | null = null;
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

/**
 * Web shell (Cloudflare demo): the tray menu and settings window become a
 * page-embedded toolbar, drawer, and fake-desktop backdrop. Desktop never
 * reads any of this.
 */
const isWeb = !isTauri();
const settingsOpen = ref(false);
const openPopover = ref<"feed" | "weather" | "backdrop" | null>(null);
const backdrop = ref<BackdropState>(
  isWeb ? loadBackdrop() : { mode: "checker", color: "#000000", image: null, images: [] },
);
const backdropCss = computed(() => (isWeb ? backdropStyle(backdrop.value) : {}));
const todayStats = ref({ kills: 0, bestCombo: 0 });
const sprayLeft = ref(0);
const weatherKinds = RAIN_KIND_ORDER;
const swatches = BACKDROP_SWATCHES;
/** Settings drawer is code-split: the desktop overlay never downloads it. */
const SettingsPanel = defineAsyncComponent(() => import("./settings/SettingsApp.vue"));
if (isWeb) {
  void import("./styles/settings.css");
}

function togglePopover(name: "feed" | "weather" | "backdrop"): void {
  openPopover.value = openPopover.value === name ? null : name;
}

function toggleVisibility(): void {
  applyVisibility(!visible.value);
}

function feed(kind: FoodKind): void {
  ensureAudio();
  manager?.dropBait(kind);
  openPopover.value = null;
}

function setBackdropMode(mode: BackdropState["mode"]): void {
  backdrop.value = saveBackdrop({ ...backdrop.value, mode });
}

/** Keep the browser chrome (Safari top bar, task switcher) in sync with the backdrop. */
function syncThemeColor(): void {
  if (!isWeb || typeof document === "undefined") return;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", backdrop.value.color);
}

watch(backdrop, syncThemeColor);

function setBackdropColor(color: string): void {
  backdrop.value = saveBackdrop({ ...backdrop.value, color });
}

function clearBackdropImage(image: string): void {
  backdrop.value = removeBackdropImage(backdrop.value, image);
}

function pickBackdropImage(image: string): void {
  backdrop.value = selectBackdropImage(backdrop.value, image);
}

/** Wallpaper tab: show the library, or open the picker when empty. */
function onImageTab(): void {
  if (backdrop.value.images.length > 0) {
    setBackdropMode("image");
    return;
  }
  fileInput.value?.click();
}

const fileInput = ref<HTMLInputElement | null>(null);

function onBackdropFile(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
  input.value = "";
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      backdrop.value = addBackdropImage(backdrop.value, reader.result);
    };
    reader.readAsDataURL(file);
  }
}

/** Esc / outside-tap dismisses the web toolbar layers (never the bugs). */
function onWebKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  if (openPopover.value) openPopover.value = null;
  else if (settingsOpen.value) settingsOpen.value = false;
}

function onDismissPointer(ev: Event): void {
  const target = ev.target as HTMLElement | null;
  if (!target?.closest) return;
  if (target.closest(".web-pop") || target.closest(".web-tools") || target.closest(".web-drawer")) return;
  openPopover.value = null;
}

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
  sprayLeft.value = cooldownSecLeft(sprayReadyAt);
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
  if (isWeb && (ev.target as HTMLElement | null)?.closest?.(".web-ui")) return;
  cursorState.x = ev.clientX;
  cursorState.y = ev.clientY;
  // Desktop learns hover from the Rust cursor poller; web learns it from DOM.
  if (isWeb) cursorState.inside = true;
}

function onPointerLeave() {
  if (isWeb) cursorState.inside = false;
}

function onPointerUp(ev: PointerEvent) {
  // Touch has no hover: forget the cursor so bugs stop fleeing the last tap.
  if (isWeb && ev.pointerType === "touch") cursorState.inside = false;
}

function onPointerDown(ev: PointerEvent) {
  if (!manager || !visible.value) return;
  if (isWeb && (ev.target as HTMLElement | null)?.closest?.(".web-ui")) return;
  cursorState.x = ev.clientX;
  cursorState.y = ev.clientY;
  if (isWeb) cursorState.inside = true;
  unlockAudio();
  const bonus = ev.pointerType === "touch" ? TOUCH_HIT_BONUS : 0;
  const target = hitTestBug(manager.list, ev.clientX, ev.clientY, viewport.value, bonus);
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
  // Single-page web shell: this is the only overlay.
  if (isTauri()) {
    try {
      return getWindowLabel() === "overlay";
    } catch {
      return true;
    }
  }
  return true;
}

/** Bugs move under a stationary cursor, so hover is evaluated every rAF
 * frame from the cached payload; cursor events only refresh that payload. */
function updateCursorHover() {
  if (!manager || !visible.value) return;
  if (!cursorState.inside) {
    setClickable(false);
    return;
  }
  if (performance.now() < hoverHoldUntil) return;
  const hit = hitTestBug(manager.list, cursorState.x, cursorState.y, viewport.value);
  setClickable(!!hit);
}

/** Native windows and cursor polling follow the shared tray visibility state. */
function applyVisibility(show: boolean) {
  if (!manager) return;
  visible.value = show;
  manager.setVisible(show);
  // Native transitions reset pass-through; discard any stale hover state too.
  setClickable(false);
  cursorState.inside = false;
  hoverHoldUntil = 0;
  if (show) {
    refreshViewportSync();
    void requestOverlayCursor().catch((err) => console.error("refresh cursor failed", err));
    loop?.start();
  } else {
    loop?.stop();
    stopRainAudio();
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
  // A stored non-default backdrop must re-tint the browser chrome on load.
  syncThemeColor();
  await refreshViewport();
  // Secondary rebuilds inherit native capture state rather than overwriting it.
  const loaded = await loadSettings(isPrimaryOverlay());
  if (isWeb) {
    // Share links (?count=&species=&weather=) win over stored prefs,
    // ephemerally: the link always reproduces the scene, never rewrites it.
    const shared = parseShareParams(window.location.search);
    Object.assign(loaded, shared);
    if (shared.rain) loaded.rainWind = pickRainWind();
  }
  settings.value = loaded;
  await applyUiLocale(loaded.locale);
  const daily = await loadDailyStats();
  manager = new BugManager(loaded, viewport.value, daily ?? undefined);
  resizeCanvas();
  if (isPrimaryOverlay()) {
    dailyStatsService = createDailyStatsService(
      manager.dailyStats,
      saveDailyStats,
      (stats) => {
        todayStats.value = { kills: stats.kills, bestCombo: stats.bestCombo };
        return setTrayStats(stats.kills, stats.bestCombo);
      },
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
      void emitRandomEvent(kind);
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
    const label = getWindowLabel();
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
      updateCursorHover();
      if (!isPrimaryOverlay()) return;
      tickRainAudio(s, timeSec, show);
    },
  });
  unlistenVisibility = await listenOverlayVisibility(applyVisibility);

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("resize", refreshViewportSync);
  window.addEventListener("load", refreshViewportSync);
  // Autoplay policy: the first real gesture unlocks Web Audio. Capture runs
  // before the squish handler, so the very first click already makes sound.
  window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
  window.addEventListener("keydown", unlockAudio, { capture: true, once: true });
  if (isWeb) {
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointerdown", onDismissPointer, true);
    window.addEventListener("keydown", onWebKeydown, true);
  }

  // Data only: hover evaluation happens per frame in updateCursorHover.
  unlistenCursor = await listenCursorLocal((pos) => {
    cursorState.x = pos.x;
    cursorState.y = pos.y;
    cursorState.inside = pos.inside;
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
  window.removeEventListener("pointerdown", unlockAudio, true);
  window.removeEventListener("keydown", unlockAudio, true);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointerdown", onDismissPointer, true);
  window.removeEventListener("keydown", onWebKeydown, true);
  window.removeEventListener("resize", refreshViewportSync);
  window.removeEventListener("load", refreshViewportSync);
  unlistenKills?.();
  unlistenCursor?.();
  unlistenDisplays?.();
  unlistenSystemResumed?.();
  unlistenTray?.();
  unlistenVisibility?.();
  unlistenSettings?.();
  unlistenCommands?.();
  unlistenRandomEvent?.();
});
</script>

<template>
  <div class="overlay" :class="{ hidden: !visible, clickable, web: isWeb }">
    <div v-if="isWeb" class="backdrop" :style="backdropCss" aria-hidden="true" />
    <canvas ref="canvasRef" class="bugs-canvas" @pointerleave="onPointerLeave" />
    <Transition name="event-banner">
      <div v-if="bannerVisible" class="event-banner" aria-live="polite">
        <div class="event-banner-veil" />
        <div class="event-banner-copy">
          <p class="event-banner-title">{{ bannerTitle }}</p>
          <p class="event-banner-sub">{{ bannerSub }}</p>
        </div>
      </div>
    </Transition>
    <div v-if="isWeb" class="web-ui web-tools" role="toolbar" :aria-label="t('web.settings')">
      <button type="button" class="web-btn" :title="t('web.settings')" :aria-label="t('web.settings')" @click="settingsOpen = true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h8.6M18.6 7H20M4 17h3.6M13.4 17H20" /><circle cx="15.8" cy="7" r="2.4" /><circle cx="10.2" cy="17" r="2.4" /></svg>
      </button>
      <button type="button" class="web-btn" :title="visible ? t('web.hide') : t('web.show')" :aria-label="visible ? t('web.hide') : t('web.show')" @click="toggleVisibility">
        <svg v-if="visible" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.6-5.7 9-5.7S21 12 21 12s-3.6 5.7-9 5.7S3 12 3 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.6-5.7 9-5.7S21 12 21 12s-3.6 5.7-9 5.7S3 12 3 12Z" /><path d="M4.5 4.5l15 15" /></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.add')" :aria-label="t('web.add')" @click="handleTray('add_one')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.remove')" :aria-label="t('web.remove')" @click="handleTray('remove_one')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.regen')" :aria-label="t('web.regen')" @click="handleTray('regenerate')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="4" /><g fill="currentColor" stroke="none"><circle cx="9" cy="9" r="1.2" /><circle cx="15" cy="9" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="9" cy="15" r="1.2" /><circle cx="15" cy="15" r="1.2" /></g></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.spray')" :aria-label="t('web.spray')" :disabled="sprayLeft > 0" @click="runSpray">
        <svg v-if="sprayLeft <= 0" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9h4v10.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V9Z" /><path d="M10 9V7h4v2M12 7V5M12 5h5" /><g fill="currentColor" stroke="none"><circle cx="19" cy="4.5" r=".9" /><circle cx="20.5" cy="7" r=".9" /><circle cx="18.6" cy="9.3" r=".9" /></g></svg>
        <span v-else class="cool">{{ sprayLeft }}</span>
      </button>
      <button type="button" class="web-btn" :title="t('web.feed')" :aria-label="t('web.feed')" :aria-expanded="openPopover === 'feed'" @click="togglePopover('feed')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><g fill="currentColor" stroke="none"><circle cx="9.5" cy="10" r="1.1" /><circle cx="14.2" cy="9.3" r="1.1" /><circle cx="12" cy="13.2" r="1.1" /><circle cx="9.8" cy="15" r="1.1" /><circle cx="14.8" cy="14" r="1.1" /></g></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.weather')" :aria-label="t('web.weather')" :aria-expanded="openPopover === 'weather'" @click="togglePopover('weather')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14.5h9.5a3.75 3.75 0 0 0 .7-7.43A5.25 5.25 0 0 0 7 8.7 3.4 3.4 0 0 0 7 14.5Z" /><path d="M8.5 17.5v2.5M12 17.5v2.5M15.5 17.5v2.5" /></svg>
      </button>
      <button type="button" class="web-btn" :title="t('web.backdrop')" :aria-label="t('web.backdrop')" :aria-expanded="openPopover === 'backdrop'" @click="togglePopover('backdrop')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.4" /><path d="M5 17.5 10 12.5l3.5 3.5 2.5-2.5 3 3" /></svg>
      </button>
      <span class="today-chip" :title="t('web.today')">{{ t("web.today") }} {{ todayStats.kills }}</span>
    </div>
    <Transition name="web-pop">
      <div v-if="isWeb && openPopover === 'feed'" class="web-ui web-pop" role="menu" :aria-label="t('web.feed')">
        <button type="button" class="web-pop-item" @click="feed('cookie')">{{ t("food.cookie") }}</button>
        <button type="button" class="web-pop-item" @click="feed('sugar')">{{ t("food.sugar") }}</button>
        <button type="button" class="web-pop-item" @click="feed('fruit')">{{ t("food.fruit") }}</button>
      </div>
    </Transition>
    <Transition name="web-pop">
      <div v-if="isWeb && openPopover === 'weather'" class="web-ui web-pop" role="menu" :aria-label="t('web.weather')">
        <button type="button" class="web-pop-item" :class="{ active: !settings.rain }" @click="stopRain(); openPopover = null">{{ t("tray.rainOff") }}</button>
        <button
          v-for="kind in weatherKinds"
          :key="kind"
          type="button"
          class="web-pop-item"
          :class="{ active: settings.rain && settings.rainKind === kind }"
          @click="startRain(kind); openPopover = null"
        >{{ t(`tray.rain.${kind}`) }}</button>
      </div>
    </Transition>
    <Transition name="web-pop">
      <div v-if="isWeb && openPopover === 'backdrop'" class="web-ui web-pop" :aria-label="t('web.backdrop')">
        <div class="web-pop-row" role="group" :aria-label="t('web.backdrop')">
          <button type="button" class="web-pop-item" :class="{ active: backdrop.mode === 'checker' }" @click="setBackdropMode('checker')">{{ t("web.backdrop.checker") }}</button>
          <button type="button" class="web-pop-item" :class="{ active: backdrop.mode === 'color' }" @click="setBackdropMode('color')">{{ t("web.backdrop.color") }}</button>
          <button type="button" class="web-pop-item" :class="{ active: backdrop.mode === 'image' }" @click="onImageTab()">{{ t("web.backdrop.image") }}</button>
        </div>
        <div v-if="backdrop.mode !== 'image'" class="web-pop-row swatches">
          <button
            v-for="color in swatches"
            :key="color"
            type="button"
            class="swatch"
            :class="{ active: backdrop.color === color }"
            :style="{ background: color }"
            :aria-label="color"
            @click="setBackdropColor(color)"
          />
          <label class="swatch custom" :title="t('web.backdrop.customColor')">
            <input type="color" :value="backdrop.color" :aria-label="t('web.backdrop.customColor')" @input="setBackdropColor(($event.target as HTMLInputElement).value)" />
            <span aria-hidden="true">＋</span>
          </label>
        </div>
        <div v-if="backdrop.mode === 'image'" class="web-pop-row thumbs">
          <button
            v-for="img in backdrop.images"
            :key="img"
            type="button"
            class="thumb"
            :class="{ active: backdrop.image === img }"
            :aria-label="t('web.backdrop.image')"
            @click="pickBackdropImage(img)"
          >
            <img :src="img" alt="" />
            <span
              class="thumb-x"
              role="button"
              :aria-label="t('web.backdrop.remove')"
              @click.stop="clearBackdropImage(img)"
            >×</span>
          </button>
          <button type="button" class="thumb add" :title="t('web.backdrop.upload')" :aria-label="t('web.backdrop.upload')" @click="fileInput?.click()">＋</button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onBackdropFile" />
      </div>
    </Transition>
    <Transition name="web-drawer">
      <div v-if="isWeb && settingsOpen" class="web-ui web-drawer">
        <SettingsPanel embedded @close="settingsOpen = false" />
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

/* ---- Web shell (desktop overlay never sees these) ---- */
.overlay.web {
  pointer-events: auto;
  /* iOS ignores user-scalable=no: this kills double-tap zoom page-wide
     (the canvas opts out further with touch-action:none for drawing). */
  touch-action: manipulation;
}

.overlay.web .backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.overlay.web .bugs-canvas {
  position: relative;
  z-index: 1;
  touch-action: none;
}

/* Hide/show keeps the toolbar and backdrop alive: only the bugs go away. */
.overlay.web.hidden {
  visibility: visible;
}

.overlay.web.hidden .bugs-canvas,
.overlay.web.hidden .event-banner {
  visibility: hidden;
}

.web-ui {
  pointer-events: auto;
}

.web-tools {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  right: calc(14px + env(safe-area-inset-right, 0px));
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100dvh - 28px);
  overflow-y: auto;
  align-items: flex-end;
}

.web-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  background: rgba(20, 20, 19, 0.42);
  color: rgba(242, 240, 234, 0.78);
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition:
    border-color 0.14s cubic-bezier(0.2, 0, 0, 1),
    color 0.14s cubic-bezier(0.2, 0, 0, 1),
    background 0.14s cubic-bezier(0.2, 0, 0, 1),
    transform 0.12s cubic-bezier(0.2, 0, 0, 1);
}

.web-btn:hover {
  border-color: rgba(10, 132, 255, 0.65);
  color: #7ab8ff;
  background: rgba(20, 20, 19, 0.6);
}

.web-btn:active {
  transform: scale(0.95);
}

.web-btn:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 2px;
}

.web-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.web-btn .cool {
  font-size: 15px;
  font-weight: 700;
}

.web-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.web-btn[aria-expanded="true"] {
  border-color: rgba(10, 132, 255, 0.65);
  color: #7ab8ff;
  background: rgba(20, 20, 19, 0.6);
}

.today-chip {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(242, 240, 234, 0.85);
  background: rgba(20, 20, 19, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 2px 10px;
  backdrop-filter: blur(6px);
  white-space: nowrap;
}

.web-pop {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  right: calc(58px + env(safe-area-inset-right, 0px));
  z-index: 31;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 148px;
  width: 214px;
  max-width: calc(100vw - 120px);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(20, 20, 19, 0.82);
  backdrop-filter: blur(10px);
}

.web-pop-item {
  display: block;
  width: 100%;
  text-align: center;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #f2f0ea;
  font-size: 13px;
  cursor: pointer;
}

.web-pop-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.web-pop-item.active {
  background: rgba(10, 132, 255, 0.28);
  color: #8ac2ff;
}

.web-pop-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.web-pop-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.web-pop-row .web-pop-item {
  width: auto;
  flex: 1 1 auto;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(6, 28px);
  gap: 6px;
  justify-content: center;
  padding: 4px 2px;
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}

.swatch.active {
  border-color: #0a84ff;
}

.swatch.custom {
  position: relative;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1.5px dashed rgba(255, 255, 255, 0.35);
  color: rgba(242, 240, 234, 0.8);
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
}

.swatch.custom:hover {
  border-color: rgba(10, 132, 255, 0.7);
  color: #7ab8ff;
}

.swatch.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.thumbs {
  display: grid;
  grid-template-columns: repeat(4, 45px);
  gap: 6px;
  justify-content: center;
  padding: 4px 2px;
}

.thumb {
  position: relative;
  width: 45px;
  height: 45px;
  border-radius: 8px;
  border: 2px solid transparent;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
}

.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb.active {
  border-color: #0a84ff;
}

.thumb.add {
  display: grid;
  place-items: center;
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.35);
  color: rgba(242, 240, 234, 0.8);
  font-size: 20px;
  font-weight: 600;
}

.thumb.add:hover {
  border-color: rgba(10, 132, 255, 0.7);
  color: #7ab8ff;
}

.thumb-x {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(10, 10, 10, 0.65);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.thumb-x:hover {
  background: #c00;
}

.web-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  width: min(420px, 100%);
  overflow-y: auto;
  background: var(--bg, #f2f2f7);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35);
}

.web-pop-enter-active,
.web-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.18s ease;
  transform-origin: top right;
}

.web-pop-enter-from,
.web-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-6px);
}

.web-drawer-enter-active,
.web-drawer-leave-active {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.2, 0, 0, 1);
}

.web-drawer-enter-from,
.web-drawer-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

@media (prefers-reduced-motion: reduce) {
  .web-pop-enter-active,
  .web-pop-leave-active,
  .web-drawer-enter-active,
  .web-drawer-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
