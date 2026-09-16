<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { ensureAudio, playHurtSound, playSquishSound } from "./core/audio";
import { DEFAULT_SETTINGS } from "./core/config";
import { BugManager, emptyDailyStats } from "./core/bugManager";
import { hitTestBug } from "./core/hitTest";
import { createLoop } from "./core/loop";
import type { CursorState, Settings, Viewport } from "./core/types";
import {
  fitWindowToDisplay,
  listenCursorLocal,
  listenDisplaysChanged,
  listenTray,
  listenKillReports,
  reportKill,
  setCursorPollerEnabled,
  setOverlayClickable,
  setTrayStats,
  setTrayRain,
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
import type { RainKind } from "./core/types";

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
let unlistenTray: (() => void) | null = null;
let unlistenSettings: (() => void) | null = null;
let unlistenCommands: (() => void) | null = null;
let clickableFlag = false;
let hoverHoldUntil = 0;
const cursorState: CursorState = { x: 0, y: 0, inside: false };
let unlistenKills: (() => void) | null = null;
let dailyStatsService: ReturnType<typeof createDailyStatsService> | null = null;
let autoRainClock = createAutoRainClock(performance.now(), false);
let autoRainTimer = 0;

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
  }

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

  unlistenSettings = await listenSettings((next) => {
    applySettings(next);
  });

  unlistenCommands = await listenOverlayCommands((cmd) => {
    if (!manager) return;
    if (cmd === "clear") {
      manager.clear();
    } else if (cmd === "regenerate") {
      manager.regenerate();
    }
  });
});

onUnmounted(() => {
  loop?.stop();
  window.clearInterval(autoRainTimer);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("resize", refreshViewportSync);
  window.removeEventListener("load", refreshViewportSync);
  unlistenKills?.();
  unlistenCursor?.();
  unlistenDisplays?.();
  unlistenTray?.();
  unlistenSettings?.();
  unlistenCommands?.();
});
</script>

<template>
  <div class="overlay" :class="{ hidden: !visible, clickable }">
    <canvas ref="canvasRef" class="bugs-canvas" />
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
</style>
