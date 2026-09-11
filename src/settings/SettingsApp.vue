<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { LIMITS } from "../core/config";
import type { Settings } from "../core/types";
import { t } from "../i18n";
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

const speciesOptions = computed(() => {
  void localeVersion.value;
  return [
    { id: "random", label: t("species.random"), emoji: "🎲" },
    { id: "cockroach", label: t("species.cockroach"), emoji: "🪳" },
    { id: "ant", label: t("species.ant"), emoji: "🐜" },
    { id: "spider", label: t("species.spider"), emoji: "🕷" },
    { id: "fly", label: t("species.fly"), emoji: "🪰" },
    { id: "ladybug", label: t("species.ladybug"), emoji: "🐞" },
  ];
});

const settings = reactive<Settings>({
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
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

function toggle(key: "sound" | "stains" | "particles") {
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

async function setLocale(locale: Settings["locale"]) {
  settings.locale = locale;
  await persist();
  localeVersion.value++;
}

async function clearAll() {
  await sendOverlayCommand("clear");
}

async function regenerate() {
  await sendOverlayCommand("regenerate");
}

onMounted(async () => {
  const loaded = await loadSettings();
  Object.assign(settings, loaded);
  applyThemeToDocument(document, settings.theme);
  await applyUiLocale(settings.locale);
  localeVersion.value++;

  unlistenSettings = await listenSettings((next) => {
    if (ignoreNextBroadcast) {
      ignoreNextBroadcast = false;
      return;
    }
    Object.assign(settings, next);
    applyThemeToDocument(document, settings.theme);
    void applyUiLocale(settings.locale);
    localeVersion.value++;
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
      <div class="row head">
        <div>
          <label>{{ tt("species.title") }}</label>
          <p class="hint">{{ tt("species.hint") }}</p>
        </div>
      </div>
      <div class="species-grid">
        <button
          v-for="opt in speciesOptions"
          :key="opt.id"
          type="button"
          class="species"
          :class="{ active: settings.species === opt.id }"
          @click="setSpecies(opt.id)"
        >
          <span class="species-emoji">{{ opt.emoji }}</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>{{ tt("count.title") }}</label>
          <p class="hint">1 – {{ LIMITS.countMax }} · {{ tt("count.hint") }}</p>
        </div>
        <div class="stepper">
          <button type="button" class="btn ghost" @click="setCount(settings.count - 1)">−</button>
          <span class="count">{{ settings.count }}</span>
          <button type="button" class="btn ghost" @click="setCount(settings.count + 1)">+</button>
        </div>
      </div>
      <input
        class="slider"
        type="range"
        :min="LIMITS.countMin"
        :max="LIMITS.countMax"
        step="1"
        :value="settings.count"
        @input="onSlider('count', $event)"
      />
    </section>

    <section class="card">
      <div class="row">
        <div class="grow">
          <label>{{ tt("size.title") }}</label>
          <p class="hint">{{ tt("size.hint") }}</p>
        </div>
        <output>{{ settings.size.toFixed(2) }}×</output>
      </div>
      <input
        class="slider"
        type="range"
        :min="LIMITS.sizeMin"
        :max="LIMITS.sizeMax"
        step="0.05"
        :value="settings.size"
        @input="onSlider('size', $event)"
      />

      <div class="row spacer">
        <div class="grow">
          <label>{{ tt("speed.title") }}</label>
          <p class="hint">{{ tt("speed.hint") }}</p>
        </div>
        <output>{{ settings.speed.toFixed(2) }}×</output>
      </div>
      <input
        class="slider"
        type="range"
        :min="LIMITS.speedMin"
        :max="LIMITS.speedMax"
        step="0.05"
        :value="settings.speed"
        @input="onSlider('speed', $event)"
      />

      <div class="row spacer">
        <div class="grow">
          <label>{{ tt("randomness.title") }}</label>
          <p class="hint">{{ tt("randomness.hint") }}</p>
        </div>
        <output>{{ Math.round(settings.randomness * 100) }}%</output>
      </div>
      <input
        class="slider"
        type="range"
        :min="LIMITS.randomnessMin"
        :max="LIMITS.randomnessMax"
        step="0.01"
        :value="settings.randomness"
        @input="onSlider('randomness', $event)"
      />
    </section>

    <section class="card">
      <div class="toggles">
        <button type="button" class="toggle" :class="{ on: settings.sound }" @click="toggle('sound')">
          <span>{{ tt("toggle.sound") }}</span>
          <em>{{ settings.sound ? tt("toggle.on") : tt("toggle.off") }}</em>
        </button>
        <button type="button" class="toggle" :class="{ on: settings.stains }" @click="toggle('stains')">
          <span>{{ tt("toggle.stains") }}</span>
          <em>{{ settings.stains ? tt("toggle.on") : tt("toggle.off") }}</em>
        </button>
        <button
          type="button"
          class="toggle"
          :class="{ on: settings.particles }"
          :title="tt('toggle.particles.tip')"
          @click="toggle('particles')"
        >
          <span>{{ tt("toggle.particles") }}</span>
          <em>{{ settings.particles ? tt("toggle.on") : tt("toggle.off") }}</em>
        </button>
        <button type="button" class="toggle" :class="{ on: settings.autostart }" @click="toggleAutostart">
          <span>{{ tt("toggle.autostart") }}</span>
          <em>{{ settings.autostart ? tt("toggle.on") : tt("toggle.off") }}</em>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>{{ tt("theme.title") }}</label>
          <p class="hint">{{ tt("theme.hint") }}</p>
        </div>
      </div>
      <div class="segmented">
        <button type="button" :class="{ active: settings.theme === 'light' }" @click="setTheme('light')">
          {{ tt("theme.light") }}
        </button>
        <button type="button" :class="{ active: settings.theme === 'dark' }" @click="setTheme('dark')">
          {{ tt("theme.dark") }}
        </button>
        <button type="button" :class="{ active: settings.theme === 'auto' }" @click="setTheme('auto')">
          {{ tt("theme.auto") }}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>{{ tt("monitor.title") }}</label>
          <p class="hint">{{ tt("monitor.hint") }}</p>
        </div>
      </div>
      <div class="segmented two">
        <button
          type="button"
          :class="{ active: settings.monitorMode === 'primary' }"
          @click="setMonitorMode('primary')"
        >
          {{ tt("monitor.primary") }}
        </button>
        <button
          type="button"
          :class="{ active: settings.monitorMode === 'all' }"
          @click="setMonitorMode('all')"
        >
          {{ tt("monitor.all") }}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>{{ tt("language.title") }}</label>
          <p class="hint">{{ tt("language.hint") }}</p>
        </div>
      </div>
      <div class="segmented">
        <button type="button" :class="{ active: settings.locale === 'auto' }" @click="setLocale('auto')">
          {{ tt("language.auto") }}
        </button>
        <button type="button" :class="{ active: settings.locale === 'zh-CN' }" @click="setLocale('zh-CN')">
          {{ tt("language.zh-CN") }}
        </button>
        <button type="button" :class="{ active: settings.locale === 'en' }" @click="setLocale('en')">
          {{ tt("language.en") }}
        </button>
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
