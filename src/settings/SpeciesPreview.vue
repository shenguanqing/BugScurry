<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { createBug } from "../core/bug";
import { DEFAULT_SETTINGS } from "../core/config";
import { drawBug } from "../core/renderer";
import { Rng } from "../core/rng";
import type { Bug } from "../core/types";
import { CENTER_BIAS } from "./speciesPreviewLayout";

const props = withDefaults(
  defineProps<{
    speciesId: string;
    label: string;
    /** Parent drives this on label hover / radio focus. */
    playing?: boolean;
    /** Drawn body size in CSS px inside the preview box. */
    size?: number;
    /** Canvas CSS box (ignored when fill is true). */
    width?: number;
    height?: number;
    /** Stretch to the parent box (popover uses this to match a grid cell). */
    fill?: boolean;
  }>(),
  { playing: false, size: 26, width: 52, height: 40, fill: false },
);

/** Side-profile species read best facing right; top-down face up. */
const SIDE_VIEW = new Set(["ant", "bee", "caterpillar", "mosquito"]);
/** Matches the QA page gait loop so the step rate feels familiar. */
const GAIT_MS = 1400;

const canvasRef = ref<HTMLCanvasElement | null>(null);
let bug: Bug | null = null;
let raf = 0;
let reducedMotion = false;

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildBug(): Bug {
  const next = createBug(
    { width: 80, height: 80, dpr: 1 },
    { ...DEFAULT_SETTINGS, species: props.speciesId },
    new Rng(seedFromId(props.speciesId)),
  );
  next.x = 0;
  next.y = 0;
  next.size = props.size;
  next.maxHp = 1;
  next.hp = 1;
  next.hurtTimer = 0;
  next.satisfiedTimer = 0;
  next.state = "crawling";
  next.heading = SIDE_VIEW.has(props.speciesId) ? 0 : -Math.PI / 2;
  return next;
}

function paint(phase: number): void {
  const canvas = canvasRef.value;
  if (!canvas || !bug) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || props.width;
  const h = canvas.clientHeight || props.height;
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  bug.legPhase = phase;
  const [bx, by] = CENTER_BIAS[props.speciesId] ?? [0, 0];
  ctx.save();
  ctx.translate(w / 2 + bx * props.size, h / 2 + by * props.size);
  drawBug(ctx, bug);
  ctx.restore();
}

function frame(t: number): void {
  if (!props.playing || reducedMotion) return;
  paint((t / GAIT_MS) % 1);
  raf = requestAnimationFrame(frame);
}

function stopLoop(): void {
  cancelAnimationFrame(raf);
  raf = 0;
}

function syncPlaying(): void {
  stopLoop();
  if (!bug) return;
  if (props.playing && !reducedMotion) {
    raf = requestAnimationFrame(frame);
  } else {
    paint(0.18);
  }
}

onMounted(() => {
  reducedMotion =
    typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  bug = buildBug();
  paint(0.18);
  syncPlaying();
});

onUnmounted(stopLoop);

watch(
  () => props.speciesId,
  () => {
    bug = buildBug();
    syncPlaying();
  },
);

watch(() => props.playing, syncPlaying);
</script>

<template>
  <canvas
    ref="canvasRef"
    class="species-canvas"
    :class="{ fill }"
    role="img"
    :aria-label="label"
    :style="fill ? undefined : { width: `${width}px`, height: `${height}px` }"
  />
</template>

<style scoped>
.species-canvas {
  display: block;
  pointer-events: none;
}

.species-canvas.fill {
  width: 100%;
  height: 100%;
}
</style>
