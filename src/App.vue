<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { ensureAudio, playHurtSound, playSquishSound } from "./core/audio";
import { DEFAULT_SETTINGS } from "./core/config";
import { BugManager } from "./core/bugManager";
import { hitTestBug } from "./core/hitTest";
import { createLoop } from "./core/loop";
import type { CursorState, Settings, Viewport } from "./core/types";
import {
  fitWindowToDisplay,
  listenCursorLocal,
  listenDisplaysChanged,
  listenTray,
  setCursorPollerEnabled,
  setOverlayClickable,
  setTrayStats,
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
let unlistenTray: (() => void) | null = null;
let unlistenSettings: (() => void) | null = null;
let unlistenCommands: (() => void) | null = null;
let clickableFlag = false;
let hoverHoldUntil = 0;
const cursorState: CursorState = { x: 0, y: 0, inside: false };
let statsFlushAt = 0;

async function flushTrayStats() {
  if (!manager || !isPrimaryOverlay()) return;
  const s = manager.dailyStats;
  const label = `${t("tray.stats")}: ${s.kills} · ${s.bestCombo}×`;
  void setTrayStats(label);
  const now = performance.now();
  if (now - statsFlushAt < 800) return;
  statsFlushAt = now;
  void saveDailyStats(s);
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
  settings.value = next;
  manager?.applySettings(next);
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
    void flushTrayStats();
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
      manager.dropBait();
      break;
    case "open_settings":
      void openSettingsWindow();
      break;
    default:
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
  void flushTrayStats();

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
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("resize", refreshViewportSync);
  window.removeEventListener("load", refreshViewportSync);
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
