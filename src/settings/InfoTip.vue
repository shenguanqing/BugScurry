<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  /** Plain single-block help text. */
  text?: string;
  /** Optional bullet list rendered under / instead of `text`. */
  lines?: string[];
  /** Accessible name for the info button (usually the row title). */
  label: string;
}>();

const open = ref(false);
const btnRef = ref<HTMLButtonElement | null>(null);
const popRef = ref<HTMLElement | null>(null);
/** Visual top-left of the bubble in viewport coords (no CSS centering transform). */
const pos = ref({ top: 0, left: 0 });

let openTimer = 0;
let closeTimer = 0;

function clearTimers() {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
}

function place() {
  const btn = btnRef.value;
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const pop = popRef.value;
  const popH = pop?.offsetHeight ?? 52;
  const popW = pop?.offsetWidth ?? 200;
  const gap = 6;
  const margin = 8;

  let top = r.bottom + gap;
  if (top + popH > window.innerHeight - margin) {
    top = r.top - popH - gap;
  }
  if (top < margin) top = margin;

  // Anchor to the icon, then clamp so the bubble stays inside the window.
  let left = r.left + r.width / 2 - popW / 2;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - popW - margin));

  pos.value = { top, left };
}

async function show() {
  clearTimers();
  place();
  open.value = true;
  await nextTick();
  place();
}

function scheduleOpen() {
  clearTimers();
  openTimer = window.setTimeout(() => {
    void show();
  }, 180);
}

function scheduleClose() {
  clearTimers();
  closeTimer = window.setTimeout(() => {
    open.value = false;
  }, 120);
}

function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  void show();
}

function onViewportChange() {
  if (open.value) place();
}

onMounted(() => {
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
});

onUnmounted(() => {
  clearTimers();
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
});
</script>

<template>
  <span
    class="info-tip"
    @mouseenter="scheduleOpen"
    @mouseleave="scheduleClose"
  >
    <button
      ref="btnRef"
      type="button"
      class="info-tip-btn"
      :aria-label="props.label"
      :aria-expanded="open"
      @click.stop="toggle"
      @focus="void show()"
      @blur="scheduleClose"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25" />
        <path d="M7 6.2v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        <circle cx="7" cy="4.1" r="0.85" fill="currentColor" />
      </svg>
    </button>
    <!-- Teleport + fixed: sibling cards / scroll containers cannot cover or clip it. -->
    <Teleport to="body">
      <Transition name="info-pop">
        <div
          v-if="open"
          ref="popRef"
          class="info-tip-pop"
          role="tooltip"
          :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
        >
          <p v-if="props.text" class="info-tip-text">{{ props.text }}</p>
          <ul v-if="props.lines?.length" class="info-tip-list">
            <li v-for="(line, i) in props.lines" :key="i">{{ line }}</li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.info-tip {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  margin-left: 4px;
  vertical-align: middle;
}

.info-tip-btn {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 4px;
  margin: -4px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted, #8a847c);
  cursor: pointer;
  border-radius: 999px;
}

.info-tip-btn:hover,
.info-tip-btn:focus-visible {
  color: var(--ink, #2a2824);
  background: color-mix(in srgb, var(--ink, #2a2824) 8%, transparent);
}

.info-tip-btn:focus-visible {
  outline: 2px solid var(--accent, #0a84ff);
  outline-offset: 1px;
}
</style>

<style>
/* Unscoped: teleported to <body>. */
.info-tip-pop {
  position: fixed;
  z-index: 10000;
  width: max-content;
  max-width: min(260px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--card-solid, #fff);
  border: 1px solid var(--line, #d4cdc2);
  box-shadow: var(--elevated-shadow, 0 10px 28px rgba(0, 0, 0, 0.16));
  color: var(--ink, #2a2824);
  font-size: 12px;
  font-weight: 450;
  line-height: 1.45;
  pointer-events: none;
  text-align: left;
}

.info-tip-text {
  margin: 0;
}

.info-tip-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.info-tip-list:first-child {
  margin-top: 0;
}

.info-tip-list li {
  position: relative;
  padding-left: 10px;
}

.info-tip-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--muted, #8a847c);
}

.info-pop-enter-active,
.info-pop-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.info-pop-enter-from,
.info-pop-leave-to {
  opacity: 0;
  transform: translateY(2px);
}
</style>
