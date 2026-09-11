<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { clampSettings, loadSettings, saveSettings } from "../services/settingsService";
import type { Settings } from "../core/types";

const count = ref(1);
const visible = ref(true);
let unlisten: UnlistenFn | null = null;

async function refreshFromSettings() {
  const s = await loadSettings();
  count.value = s.count;
}

async function addOne() {
  count.value = Math.min(50, count.value + 1);
  const next = clampSettings({ ...(await loadSettings()), count: count.value });
  await saveSettings(next);
  await invoke("popup_add_one");
}

async function removeOne() {
  count.value = Math.max(1, count.value - 1);
  const next = clampSettings({ ...(await loadSettings()), count: count.value });
  await saveSettings(next);
  await invoke("popup_remove_one");
}

async function toggleVisibility() {
  visible.value = !visible.value;
  await invoke("popup_toggle_visibility");
}

async function regenerate() {
  await invoke("popup_regenerate");
}

async function openSettings() {
  await invoke("open_settings_window");
  await getCurrentWindow().hide();
}

async function quitApp() {
  await invoke("quit_app");
}

async function closeSelf() {
  await getCurrentWindow().hide();
}

onMounted(async () => {
  await refreshFromSettings();
  unlisten = await listen<Settings>("settings-changed", (e) => {
    count.value = clampSettings(e.payload).count;
  });
});

onUnmounted(() => {
  unlisten?.();
});
</script>

<template>
  <div class="popup" @contextmenu.prevent>
    <header>
      <strong>BugScurry</strong>
      <button type="button" class="close" title="关闭" @click="closeSelf">×</button>
    </header>

    <section class="row">
      <span class="label">虫子</span>
      <div class="stepper">
        <button type="button" @click="removeOne">−</button>
        <span class="count">{{ count }}</span>
        <button type="button" @click="addOne">+</button>
      </div>
    </section>

    <section class="actions">
      <button type="button" @click="toggleVisibility">
        {{ visible ? "隐藏虫子" : "显示虫子" }}
      </button>
      <button type="button" @click="regenerate">重新生成</button>
      <button type="button" @click="openSettings">设置…</button>
      <button type="button" class="danger" @click="quitApp">退出</button>
    </section>

    <footer>点击外部关闭 · ⌘+ 增加</footer>
  </div>
</template>
