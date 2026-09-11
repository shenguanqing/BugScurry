<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { LIMITS } from "../core/config";
import type { Settings } from "../core/types";
import {
  loadSettings,
  saveSettings,
  sendOverlayCommand,
} from "../services/settingsService";

const settings = reactive<Settings>({
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
});

const savedFlash = ref(false);
let flashTimer: number | undefined;

async function persist() {
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

function onSlider(key: keyof Settings, ev: Event) {
  const el = ev.target as HTMLInputElement;
  const value = Number(el.value);
  if (key === "count") setCount(value);
  else {
    (settings as Record<string, number | boolean>)[key] = value;
    void persist();
  }
}

function toggle(key: "sound" | "stains" | "particles") {
  settings[key] = !settings[key];
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
});

onUnmounted(() => {
  window.clearTimeout(flashTimer);
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
        <button type="button" class="toggle" :class="{ on: settings.particles }" @click="toggle('particles')">
          <span>粒子效果</span>
          <em>{{ settings.particles ? "开" : "关" }}</em>
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
