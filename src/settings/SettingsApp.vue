<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { LIMITS } from "../core/config";
import type { Settings } from "../core/types";
import { listSpecies } from "../species";
import {
  applyMonitorMode,
  applyThemeToDocument,
  listenSettings,
  loadSettings,
  saveSettings,
  sendOverlayCommand,
  setAutostart,
} from "../services/settingsService";

const speciesOptions = [
  { id: "random", label: "随机", emoji: "🎲" },
  ...listSpecies().map((s) => ({ id: s.id, label: s.label, emoji: s.emoji })),
];

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
});

const savedFlash = ref(false);
let flashTimer: number | undefined;
let unlistenSettings: UnlistenFn | null = null;
/** Ignore the next settings-changed if we caused it (avoid echo loops). */
let ignoreNextBroadcast = false;

async function persist() {
  ignoreNextBroadcast = true;
  await saveSettings({ ...settings });
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

  // Tray / overlay can change count etc.; keep this window in sync.
  unlistenSettings = await listenSettings((next) => {
    if (ignoreNextBroadcast) {
      ignoreNextBroadcast = false;
      return;
    }
    Object.assign(settings, next);
    applyThemeToDocument(document, settings.theme);
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
        <p class="tagline">桌面小虫控制台 · 不弄脏屏幕</p>
      </div>
      <span class="badge" :class="{ on: savedFlash }">
        {{ savedFlash ? "已保存" : "实时生效" }}
      </span>
    </header>

    <section class="card">
      <div class="row head">
        <div>
          <label>虫子类型</label>
          <p class="hint">换一批不太一样的住户</p>
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
          <label>虫子数量</label>
          <p class="hint">1 – {{ LIMITS.countMax }} 只，即时增减</p>
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
          <label>虫子大小</label>
          <p class="hint">看起来有多「壮」</p>
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
          <label>爬行速度</label>
          <p class="hint">慢吞吞 → 夺命狂奔</p>
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
          <label>随机程度</label>
          <p class="hint">越高越神经质</p>
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
          <span>捏死音效</span>
          <em>{{ settings.sound ? "开" : "关" }}</em>
        </button>
        <button type="button" class="toggle" :class="{ on: settings.stains }" @click="toggle('stains')">
          <span>死亡痕迹</span>
          <em>{{ settings.stains ? "开" : "关" }}</em>
        </button>
        <button type="button" class="toggle" :class="{ on: settings.particles }" title="捏死瞬间向外飞溅的小液珠；地面汁液由死亡痕迹控制" @click="toggle('particles')">
          <span>液珠飞溅</span>
          <em>{{ settings.particles ? "开" : "关" }}</em>
        </button>
        <button type="button" class="toggle" :class="{ on: settings.autostart }" @click="toggleAutostart">
          <span>开机启动</span>
          <em>{{ settings.autostart ? "开" : "关" }}</em>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>外观</label>
          <p class="hint">浅色 / 深色 / 跟随系统</p>
        </div>
      </div>
      <div class="segmented">
        <button
          type="button"
          :class="{ active: settings.theme === 'light' }"
          @click="setTheme('light')"
        >
          浅色
        </button>
        <button
          type="button"
          :class="{ active: settings.theme === 'dark' }"
          @click="setTheme('dark')"
        >
          深色
        </button>
        <button
          type="button"
          :class="{ active: settings.theme === 'auto' }"
          @click="setTheme('auto')"
        >
          自动
        </button>
      </div>
    </section>

    <section class="card">
      <div class="row head">
        <div>
          <label>多显示器</label>
          <p class="hint">当前屏幕 / 所有屏幕</p>
        </div>
      </div>
      <div class="segmented two">
        <button
          type="button"
          :class="{ active: settings.monitorMode === 'primary' }"
          @click="setMonitorMode('primary')"
        >
          当前屏幕
        </button>
        <button
          type="button"
          :class="{ active: settings.monitorMode === 'all' }"
          @click="setMonitorMode('all')"
        >
          所有屏幕
        </button>
      </div>
    </section>

    <section class="actions">
      <button type="button" class="btn primary" @click="regenerate">重新生成</button>
      <button type="button" class="btn danger" @click="clearAll">全部清除</button>
    </section>

    <footer class="footer">
      关闭本窗口不会退出应用 · 托盘菜单仍可控制
    </footer>
  </div>
</template>
