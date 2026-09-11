<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { DEFAULT_SETTINGS } from "./core/config";
import { BugManager } from "./core/bugManager";
import { hitTestBug } from "./core/hitTest";
import { createLoop } from "./core/loop";
import type { Settings, Viewport } from "./core/types";
import {
  fitWindowToDisplay,
  listenCursor,
  listenTray,
  setOverlayClickable,
} from "./services/tauriBridge";

const canvasRef = ref<HTMLCanvasElement | null>(null);

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const viewport = ref<Viewport>({ width: 1440, height: 900, dpr: 1 });
const visible = ref(true);
const clickable = ref(true);

let manager: BugManager | null = null;
let loop: ReturnType<typeof createLoop> | null = null;
let unlistenCursor: (() => void) | null = null;
let unlistenTray: (() => void) | null = null;
let clickableFlag = true;
let hoverHoldUntil = 0;

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const vp = viewport.value;
  canvas.width = Math.floor(vp.width * vp.dpr);
  canvas.height = Math.floor(vp.height * vp.dpr);
  canvas.style.width = `${vp.width}px`;
  canvas.style.height = `${vp.height}px`;
}

async function refreshViewport() {
  const fitted = await fitWindowToDisplay();
  viewport.value = fitted;
  resizeCanvas();
  manager?.setViewport(fitted);
}

function setClickable(next: boolean) {
  if (clickableFlag === next) return;
  clickableFlag = next;
  clickable.value = next;
  void setOverlayClickable(next);
}

function onPointerDown(ev: PointerEvent) {
  if (!manager) return;
  const hit = hitTestBug(manager.list, ev.clientX, ev.clientY, viewport.value);
  if (hit) {
    manager.squish(hit);
    hoverHoldUntil = performance.now() + 400;
    setClickable(true);
  }
}

function handleTray(cmd: string) {
  if (!manager) return;
  switch (cmd) {
    case "toggle_visibility":
      visible.value = !visible.value;
      manager.setVisible(visible.value);
      break;
    case "add_one":
      manager.addOne();
      settings.value = { ...settings.value, count: manager.list.length };
      break;
    case "remove_one":
      manager.removeOne();
      settings.value = { ...settings.value, count: manager.list.length };
      break;
    case "regenerate":
      manager.regenerate();
      break;
    case "open_settings":
      break;
    default:
      break;
  }
}

onMounted(async () => {
  await refreshViewport();
  manager = new BugManager(settings.value, viewport.value);
  resizeCanvas();

  loop = createLoop({
    manager,
    getSettings: () => settings.value,
    getViewport: () => viewport.value,
    getCanvas: () => canvasRef.value,
  });
  loop.start();

  window.addEventListener("pointerdown", onPointerDown);

  unlistenCursor = await listenCursor((pos) => {
    if (!manager) return;
    if (performance.now() < hoverHoldUntil) return;
    const hit = hitTestBug(manager.list, pos.x, pos.y, viewport.value);
    setClickable(!!hit);
  });

  unlistenTray = await listenTray((cmd) => handleTray(cmd));
});

onUnmounted(() => {
  loop?.stop();
  window.removeEventListener("pointerdown", onPointerDown);
  unlistenCursor?.();
  unlistenTray?.();
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
  /* OS is not ignoring events; DOM must accept them for squish clicks. */
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
