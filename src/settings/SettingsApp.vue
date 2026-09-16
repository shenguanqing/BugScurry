<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LIMITS } from "../core/config";
import type { FoodKind, Settings } from "../core/types";
import { t } from "../i18n";
import { getSpecies, listSpecies } from "../species";
import SpeciesPreview from "./SpeciesPreview.vue";
import {
  applyMonitorMode,
  applyThemeToDocument,
  applyUiLocale,
  listenSettings,
  loadSettings,
  saveSettings,
  sendOverlayCommand,
  setAutostart,
} from "../services/settingsService";

/** Force re-render of t() strings when locale changes. */
const localeVersion = ref(0);
function tt(key: string): string {
  void localeVersion.value;
  return t(key);
}

/** Built-in species from the registry — new species show up automatically. */
const speciesOptions = computed(() => {
  void localeVersion.value;
  return listSpecies()
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
    .map((s) => ({
      id: s.id,
      label: t(`species.${s.id}`) !== `species.${s.id}` ? t(`species.${s.id}`) : s.label,
      emoji: s.emoji,
    }));
});

const settings = reactive<Settings>({
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
  repellent: true,
  autostart: false,
  monitorMode: "primary",
  species: "random",
  theme: "auto",
  locale: "auto",
  rain: false,
  rainKind: "moderate",
  rainWind: 0,
  autoRain: false,
});

const foodEmoji: Record<FoodKind, string> = { cookie: "🍪", sugar: "🍬", fruit: "🍓" };
const personalities = ["shy", "greedy", "lazy", "curious"] as const;

const favoriteFood = computed(() => getSpecies(settings.species)?.traits.favoriteFood);
const hoveredSpecies = ref<string | null>(null);
const focusedSpecies = ref<string | null>(null);
/** True while the pointer is inside the species grid (keeps the popover up). */
const previewHover = ref(false);
const speciesGridRef = ref<HTMLElement | null>(null);
/** Popover anchor in the grid-wrap box; clamped so it stays on-screen. */
const popoverLeft = ref("50%");
const popoverBottom = ref("calc(100% + 6px)");
/** Square edge length = one grid cell (kept in px so height cannot stretch). */
const popoverSize = ref(96);

const popoverStyle = computed(() => ({
  "--pop-left": popoverLeft.value,
  "--pop-bottom": popoverBottom.value,
  "--pop-size": `${popoverSize.value}px`,
}));

function placePopover(tile: HTMLElement | null): void {
  const wrap = speciesGridRef.value?.parentElement;
  if (!tile || !wrap) {
    popoverLeft.value = "50%";
    popoverBottom.value = "calc(100% + 6px)";
    popoverSize.value = 96;
    return;
  }
  const tileRect = tile.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  // Same metric as the 3-column grid: cell = (W - 2*gap) / 3.
  const cell = Math.round((wrapRect.width - 16) / 3);
  popoverSize.value = cell;
  const half = cell / 2;
  const center = tileRect.left + tileRect.width / 2 - wrapRect.left;
  const min = half;
  const max = Math.max(min, wrapRect.width - half);
  popoverLeft.value = `${Math.round(Math.min(max, Math.max(min, center)))}px`;
  // Vertical: sit just above THIS tile's top edge (not the whole grid).
  const tileTop = tileRect.top - wrapRect.top;
  popoverBottom.value = `${Math.round(wrapRect.height - tileTop + 6)}px`;
}

function onTileEnter(id: string, ev: Event): void {
  hoveredSpecies.value = id;
  placePopover(ev.currentTarget as HTMLElement | null);
}

function onTileFocus(id: string, ev: Event): void {
  focusedSpecies.value = id;
  placePopover((ev.currentTarget as HTMLElement | null)?.closest(".species") ?? null);
}

const previewTarget = computed(() => {
  if (focusedSpecies.value) {
    return speciesOptions.value.find((opt) => opt.id === focusedSpecies.value) ?? null;
  }
  if (!previewHover.value || !hoveredSpecies.value) return null;
  return speciesOptions.value.find((opt) => opt.id === hoveredSpecies.value) ?? null;
});

const savedFlash = ref(false);
let flashTimer: number | undefined;
let unlistenSettings: UnlistenFn | null = null;
let ignoreNextBroadcast = false;

async function persist() {
  ignoreNextBroadcast = true;
  await saveSettings({ ...settings });
  localeVersion.value++;
  savedFlash.value = true;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    savedFlash.value = false;
  }, 600);
}

function setCount(n: number) {
  settings.count = Math.min(LIMITS.countMax, Math.max(LIMITS.countMin, n));
  void persist();
}

function onSlider(key: "size" | "speed" | "randomness" | "count", ev: Event) {
  const el = ev.target as HTMLInputElement;
  const value = Number(el.value);
  if (key === "count") setCount(value);
  else {
    settings[key] = value;
    void persist();
  }
}

function toggle(key: "sound" | "stains" | "particles" | "repellent" | "autoRain") {
  settings[key] = !settings[key];
  void persist();
}

async function toggleAutostart() {
  settings.autostart = !settings.autostart;
  try {
    await setAutostart(settings.autostart);
  } catch (err) {
    console.error("autostart failed", err);
  }
  void persist();
}

async function setMonitorMode(mode: Settings["monitorMode"]) {
  settings.monitorMode = mode;
  void persist();
  try {
    await applyMonitorMode(mode);
  } catch (err) {
    console.error("monitor mode failed", err);
  }
}

function setSpecies(id: string) {
  settings.species = id;
  void persist();
}

function setTheme(theme: Settings["theme"]) {
  settings.theme = theme;
  applyThemeToDocument(document, theme);
  void persist();
}

function onThemeSelect(ev: Event) {
  setTheme((ev.target as HTMLSelectElement).value as Settings["theme"]);
}

async function setLocale(locale: Settings["locale"]) {
  settings.locale = locale;
  await persist();
  localeVersion.value++;
  await syncWindowTitle();
}

function onLocaleSelect(ev: Event) {
  void setLocale((ev.target as HTMLSelectElement).value as Settings["locale"]);
}

function onMonitorSelect(ev: Event) {
  void setMonitorMode((ev.target as HTMLSelectElement).value as Settings["monitorMode"]);
}

async function clearAll() {
  await sendOverlayCommand("clear");
}

async function regenerate() {
  await sendOverlayCommand("regenerate");
}

async function syncWindowTitle() {
  const title = t("app.settingsTitle");
  document.title = title;
  try {
    await getCurrentWindow().setTitle(title);
  } catch (err) {
    console.error("set window title failed", err);
  }
}

onMounted(async () => {
  const loaded = await loadSettings();
  Object.assign(settings, loaded);
  applyThemeToDocument(document, settings.theme);
  await applyUiLocale(settings.locale);
  localeVersion.value++;
  await syncWindowTitle();

  unlistenSettings = await listenSettings((next) => {
    if (ignoreNextBroadcast) {
      ignoreNextBroadcast = false;
      return;
    }
    Object.assign(settings, next);
    applyThemeToDocument(document, settings.theme);
    void applyUiLocale(settings.locale).then(() => {
      localeVersion.value++;
      void syncWindowTitle();
    });
  });
});

onUnmounted(() => {
  window.clearTimeout(flashTimer);
  unlistenSettings?.();
});
</script>

<template>
  <div class="shell">
    <header class="header">
      <div>
        <h1>BugScurry</h1>
        <p class="tagline">{{ tt("app.tagline") }}</p>
      </div>
      <span class="badge" :class="{ on: savedFlash }">
        {{ savedFlash ? tt("badge.saved") : tt("badge.live") }}
      </span>
    </header>

    <section class="card species-card" aria-labelledby="species-title">
      <div class="species-card-heading">
        <h2 id="species-title">{{ tt("species.title") }}</h2>
        <p class="hint">{{ tt("species.chooseHint") }}</p>
      </div>
      <div
        role="radiogroup"
        :aria-label="tt('species.title')"
        class="species-picker"
      >
        <label class="species-wide" :class="{ active: settings.species === 'random' }">
          <input class="species-radio" type="radio" name="species" value="random"
            :checked="settings.species === 'random'" @change="setSpecies('random')" />
          <span class="species-emoji" aria-hidden="true">🎲</span>
          <span>{{ tt("species.random") }}</span>
        </label>
        <div class="species-grid-wrap" :style="popoverStyle">
          <div
            ref="speciesGridRef"
            class="species-grid"
            @mouseenter="previewHover = true"
            @mouseleave="previewHover = false; hoveredSpecies = null"
          >
            <label v-for="opt in speciesOptions" :key="opt.id" class="species"
              :class="{ active: settings.species === opt.id }"
              @mouseenter="onTileEnter(opt.id, $event)">
              <input class="species-radio" type="radio" name="species" :value="opt.id"
                :checked="settings.species === opt.id"
                @change="setSpecies(opt.id)"
                @focus="onTileFocus(opt.id, $event)"
                @blur="focusedSpecies = null" />
              <span class="species-emoji" aria-hidden="true">{{ opt.emoji }}</span>
              <span class="species-label">{{ opt.label }}</span>
            </label>
          </div>
          <Transition name="species-pop">
            <div
              v-if="previewTarget"
              class="species-popover"
              role="presentation"
              :aria-label="previewTarget.label"
            >
              <SpeciesPreview
                :species-id="previewTarget.id"
                :label="previewTarget.label"
                :playing="true"
                :size="30"
                fill
              />
            </div>
          </Transition>
        </div>
      </div>
      <details class="feeding-guide">
        <summary>
          <span class="feeding-title">{{ tt("personality.title") }}</span>
          <span class="food-preference">
            <template v-if="favoriteFood">
              <span aria-hidden="true">{{ foodEmoji[favoriteFood] }}</span>
              <span>{{ tt("feeding.favorite") }}{{ tt(`food.${favoriteFood}`) }}</span>
            </template>
            <span v-else>{{ tt("feeding.varied") }}</span>
          </span>
          <svg class="disclosure-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="m4 2 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </summary>
        <div class="feeding-content">
          <p class="hint personality-intro">{{ tt("personality.intro") }}</p>
          <dl class="personality-list">
            <div v-for="personality in personalities" :key="personality">
              <dt>{{ tt(`personality.${personality}`) }}</dt>
              <dd>{{ tt(`personality.${personality}.detail`) }}</dd>
            </div>
          </dl>
          <p class="feeding-tip">{{ tt("feeding.shortHint") }}</p>
        </div>
      </details>
    </section>

    <section class="card">
      <div class="field">
        <div class="row head">
          <div class="grow">
            <label for="count-slider">{{ tt("count.title") }}</label>
            <p class="hint">1 – {{ LIMITS.countMax }} · {{ tt("count.hint") }}</p>
          </div>
          <div class="stepper">
            <button
              type="button"
              class="btn ghost"
              :aria-label="tt('count.title') + ' −'"
              :disabled="settings.count <= LIMITS.countMin"
              @click="setCount(settings.count - 1)"
            >−</button>
            <span class="count">{{ settings.count }}</span>
            <button
              type="button"
              class="btn ghost"
              :aria-label="tt('count.title') + ' +'"
              :disabled="settings.count >= LIMITS.countMax"
              @click="setCount(settings.count + 1)"
            >+</button>
          </div>
        </div>
        <input
          id="count-slider"
          class="slider"
          type="range"
          :min="LIMITS.countMin"
          :max="LIMITS.countMax"
          step="1"
          :value="settings.count"
          @input="onSlider('count', $event)"
        />
      </div>

      <div class="field">
        <div class="row head">
          <div class="grow">
            <label for="size-slider">{{ tt("size.title") }}</label>
            <p class="hint">{{ tt("size.hint") }}</p>
          </div>
          <output>{{ settings.size.toFixed(2) }}×</output>
        </div>
        <input
          id="size-slider"
          class="slider"
          type="range"
          :min="LIMITS.sizeMin"
          :max="LIMITS.sizeMax"
          step="0.05"
          :value="settings.size"
          :aria-valuetext="`${settings.size.toFixed(2)}×`"
          @input="onSlider('size', $event)"
        />
      </div>

      <div class="field">
        <div class="row head">
          <div class="grow">
            <label for="speed-slider">{{ tt("speed.title") }}</label>
            <p class="hint">{{ tt("speed.hint") }}</p>
          </div>
          <output>{{ settings.speed.toFixed(2) }}×</output>
        </div>
        <input
          id="speed-slider"
          class="slider"
          type="range"
          :min="LIMITS.speedMin"
          :max="LIMITS.speedMax"
          step="0.05"
          :value="settings.speed"
          :aria-valuetext="`${settings.speed.toFixed(2)}×`"
          @input="onSlider('speed', $event)"
        />
      </div>

      <div class="field">
        <div class="row head">
          <div class="grow">
            <label for="randomness-slider">{{ tt("randomness.title") }}</label>
            <p class="hint">{{ tt("randomness.hint") }}</p>
          </div>
          <output>{{ Math.round(settings.randomness * 100) }}%</output>
        </div>
        <input
          id="randomness-slider"
          class="slider"
          type="range"
          :min="LIMITS.randomnessMin"
          :max="LIMITS.randomnessMax"
          step="0.01"
          :value="settings.randomness"
          :aria-valuetext="`${Math.round(settings.randomness * 100)}%`"
          @input="onSlider('randomness', $event)"
        />
      </div>
    </section>

    <section class="card list-card">
      <div class="toggles">
        <div class="toggle-row">
          <label for="toggle-sound" class="toggle-label">{{ tt("toggle.sound") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-sound"
            :class="{ on: settings.sound }"
            role="switch"
            :aria-checked="settings.sound"
            :aria-label="tt('toggle.sound')"
            @click="toggle('sound')"
          ></button>
        </div>
        <div class="toggle-row">
          <label for="toggle-stains" class="toggle-label">{{ tt("toggle.stains") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-stains"
            :class="{ on: settings.stains }"
            role="switch"
            :aria-checked="settings.stains"
            :aria-label="tt('toggle.stains')"
            @click="toggle('stains')"
          ></button>
        </div>
        <div class="toggle-row">
          <label for="toggle-particles" class="toggle-label" :title="tt('toggle.particles.tip')">{{ tt("toggle.particles") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-particles"
            :class="{ on: settings.particles }"
            role="switch"
            :aria-checked="settings.particles"
            :aria-label="tt('toggle.particles')"
            :title="tt('toggle.particles.tip')"
            @click="toggle('particles')"
          ></button>
        </div>
        <div class="toggle-row">
          <label for="toggle-repellent" class="toggle-label" :title="tt('toggle.repellent.tip')">{{ tt("toggle.repellent") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-repellent"
            :class="{ on: settings.repellent }"
            role="switch"
            :aria-checked="settings.repellent"
            :aria-label="tt('toggle.repellent')"
            :title="tt('toggle.repellent.tip')"
            @click="toggle('repellent')"
          ></button>
        </div>
        <div class="toggle-row">
          <label for="toggle-auto-rain" class="toggle-label" :title="tt('toggle.autoRain.tip')">{{ tt("toggle.autoRain") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-auto-rain"
            :class="{ on: settings.autoRain }"
            role="switch"
            :aria-checked="settings.autoRain"
            :aria-label="tt('toggle.autoRain')"
            :title="tt('toggle.autoRain.tip')"
            @click="toggle('autoRain')"
          ></button>
        </div>
        <div class="toggle-row">
          <label for="toggle-autostart" class="toggle-label">{{ tt("toggle.autostart") }}</label>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-autostart"
            :class="{ on: settings.autostart }"
            role="switch"
            :aria-checked="settings.autostart"
            :aria-label="tt('toggle.autostart')"
            @click="toggleAutostart"
          ></button>
        </div>
      </div>
    </section>

    <section class="card list-card">
      <div class="selects">
        <div class="select-row">
          <label for="theme-select">{{ tt("theme.title") }}</label>
          <span class="select-wrap">
            <select
              id="theme-select"
              class="select"
              :value="settings.theme"
              @change="onThemeSelect"
            >
              <option value="light">{{ tt("theme.light") }}</option>
              <option value="dark">{{ tt("theme.dark") }}</option>
              <option value="auto">{{ tt("theme.auto") }}</option>
            </select>
          </span>
        </div>

        <div class="select-row">
          <label for="monitor-select">{{ tt("monitor.title") }}</label>
          <span class="select-wrap">
            <select
              id="monitor-select"
              class="select"
              :value="settings.monitorMode"
              @change="onMonitorSelect"
            >
              <option value="primary">{{ tt("monitor.primary") }}</option>
              <option value="all">{{ tt("monitor.all") }}</option>
            </select>
          </span>
        </div>

        <div class="select-row">
          <label for="language-select">{{ tt("language.title") }}</label>
          <span class="select-wrap">
            <select
              id="language-select"
              class="select"
              :value="settings.locale"
              @change="onLocaleSelect"
            >
              <option value="auto">{{ tt("language.auto") }}</option>
              <option value="zh-CN">{{ tt("language.zh-CN") }}</option>
              <option value="zh-TW">{{ tt("language.zh-TW") }}</option>
              <option value="en">{{ tt("language.en") }}</option>
              <option value="ja">{{ tt("language.ja") }}</option>
              <option value="ko">{{ tt("language.ko") }}</option>
            </select>
          </span>
        </div>
      </div>
    </section>

    <section class="actions">
      <button type="button" class="btn primary" @click="regenerate">{{ tt("action.regenerate") }}</button>
      <button type="button" class="btn danger" @click="clearAll">{{ tt("action.clear") }}</button>
    </section>

    <footer class="footer">
      {{ tt("footer") }}
    </footer>
  </div>
</template>
