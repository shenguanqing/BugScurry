<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../i18n";
import {
  applyUiLocale,
  clampSettings,
  loadSettings,
  saveSettings,
} from "../services/settingsService";
import type { Settings } from "../core/types";

const count = ref(1);
const visible = ref(true);
const localeVersion = ref(0);
let unlisten: UnlistenFn | null = null;

function tt(key: string): string {
  void localeVersion.value;
  return t(key);
}

async function refreshFromSettings() {
  const s = await loadSettings();
  count.value = s.count;
  await applyUiLocale(s.locale);
  localeVersion.value++;
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
      <button type="button" class="close" :title="tt('popup.close')" @click="closeSelf">×</button>
    </header>

    <section class="row">
      <span class="label">{{ tt("popup.bugs") }}</span>
      <div class="stepper">
        <button type="button" @click="removeOne">−</button>
        <span class="count">{{ count }}</span>
        <button type="button" @click="addOne">+</button>
      </div>
    </section>

    <section class="actions">
      <button type="button" @click="toggleVisibility">
        {{ visible ? tt("popup.hide") : tt("popup.show") }}
      </button>
      <button type="button" @click="regenerate">{{ tt("action.regenerate") }}</button>
      <button type="button" @click="openSettings">{{ tt("tray.settings") }}</button>
      <button type="button" class="danger" @click="quitApp">{{ tt("tray.quit") }}</button>
    </section>

    <footer>{{ tt("popup.footer") }}</footer>
  </div>
</template>
