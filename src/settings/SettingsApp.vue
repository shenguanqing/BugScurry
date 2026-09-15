<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LIMITS } from "../core/config";
import type { Settings } from "../core/types";
import { t } from "../i18n";
import { listSpecies } from "../species";
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

function toggle(key: "sound" | "stains" | "particles" | "repellent") {
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

    <section class="card">
      <div class="field">
        <div class="row head">
          <div class="grow">
            <span class="field-title">{{ tt("species.title") }}</span>
            <p class="hint">{{ tt("species.hint") }}</p>
          </div>
        </div>
        <button
          type="button"
          class="species-wide"
          :class="{ active: settings.species === 'random' }"
          :aria-pressed="settings.species === 'random'"
          @click="setSpecies('random')"
        >
          <span class="species-emoji">🎲</span>
          <span>{{ tt("species.random") }}</span>
        </button>
        <div class="species-grid" role="group" :aria-label="tt('species.title')">
          <button
            v-for="opt in speciesOptions"
            :key="opt.id"
            type="button"
            class="species"
            :class="{ active: settings.species === opt.id }"
            :aria-pressed="settings.species === opt.id"
            @click="setSpecies(opt.id)"
          >
            <span class="species-emoji">{{ opt.emoji }}</span>
            <span class="species-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>
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
              @click="setCount(settings.count - 1)"
            >−</button>
            <span class="count">{{ settings.count }}</span>
            <button
              type="button"
              class="btn ghost"
              :aria-label="tt('count.title') + ' +'"
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
          @input="onSlider('randomness', $event)"
        />
      </div>
    </section>

    <section class="card">
      <div class="toggles">
        <div class="toggle-row">
          <span class="toggle-label">{{ tt("toggle.sound") }}</span>
          <button
            type="button"
            class="toggle-switch"
            :class="{ on: settings.sound }"
            role="switch"
            :aria-checked="settings.sound"
            :aria-label="tt('toggle.sound')"
            @click="toggle('sound')"
          ></button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">{{ tt("toggle.stains") }}</span>
          <button
            type="button"
            class="toggle-switch"
            :class="{ on: settings.stains }"
            role="switch"
            :aria-checked="settings.stains"
            :aria-label="tt('toggle.stains')"
            @click="toggle('stains')"
          ></button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label" :title="tt('toggle.particles.tip')">{{ tt("toggle.particles") }}</span>
          <button
            type="button"
            class="toggle-switch"
            :class="{ on: settings.particles }"
            role="switch"
            :aria-checked="settings.particles"
            :aria-label="tt('toggle.particles')"
            :title="tt('toggle.particles.tip')"
            @click="toggle('particles')"
          ></button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label" :title="tt('toggle.repellent.tip')">{{ tt("toggle.repellent") }}</span>
          <button
            type="button"
            class="toggle-switch"
            :class="{ on: settings.repellent }"
            role="switch"
            :aria-checked="settings.repellent"
            :aria-label="tt('toggle.repellent')"
            :title="tt('toggle.repellent.tip')"
            @click="toggle('repellent')"
          ></button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">{{ tt("toggle.autostart") }}</span>
          <button
            type="button"
            class="toggle-switch"
            :class="{ on: settings.autostart }"
            role="switch"
            :aria-checked="settings.autostart"
            :aria-label="tt('toggle.autostart')"
            @click="toggleAutostart"
          ></button>
        </div>
      </div>
    </section>

    <section class="card">
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
