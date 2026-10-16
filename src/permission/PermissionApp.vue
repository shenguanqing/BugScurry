<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { setWindowTitle } from "../platform/desktop";
import { t } from "../i18n";
import { openSystemSettingsPane } from "../services/tauriBridge";
import {
  applyThemeToDocument,
  applyUiLocale,
  listenSettings,
  loadSettings,
} from "../services/settingsService";

const localeVersion = ref(0);
function tt(key: string): string {
  void localeVersion.value;
  return t(key);
}

let unlistenSettings: UnlistenFn | null = null;

/** Dismiss only closes the dialog; the next launch nags again until fixed. */
async function dismiss(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch (err) {
    console.error("close permission prompt failed", err);
  }
}

function openPane(pane: "input-monitoring" | "accessibility" | "login-items"): void {
  void openSystemSettingsPane(pane).catch((err) =>
    console.error("open system settings pane failed", err),
  );
}

async function syncWindowTitle(): Promise<void> {
  const title = t("permissionPrompt.title");
  document.title = title;
  setWindowTitle(title);
}

/**
 * Focus-based locale resync: window focus implies the user is looking at
 * this dialog, so re-read the persisted locale regardless of whether the
 * settings-changed event was delivered.
 */
function resyncLocale(): void {
  void loadSettings(false).then((s) => {
    void applyUiLocale(s.locale).then(() => {
      localeVersion.value++;
      void syncWindowTitle();
    });
  });
}

function onWindowFocus(): void {
  resyncLocale();
}

onMounted(async () => {
  const loaded = await loadSettings(false);
  applyThemeToDocument(document, loaded.theme);
  await applyUiLocale(loaded.locale);
  localeVersion.value++;
  await syncWindowTitle();
  // Language can change while this window sits hidden: follow it live.
  unlistenSettings = await listenSettings((next) => {
    void applyUiLocale(next.locale).then(() => {
      localeVersion.value++;
      void syncWindowTitle();
    });
  });
  window.addEventListener("focus", onWindowFocus);
});

onUnmounted(() => {
  unlistenSettings?.();
  window.removeEventListener("focus", onWindowFocus);
});
</script>

<template>
  <div class="prompt">
    <h1 class="prompt-title">{{ tt("permissionPrompt.title") }}</h1>
    <p class="prompt-body">{{ tt("permissionPrompt.body") }}</p>
    <div class="prompt-actions">
      <button type="button" class="btn prompt-action" @click="openPane('input-monitoring')">{{ tt("capture.compatibility.openInputMonitoring") }}</button>
      <button type="button" class="btn prompt-action" @click="openPane('accessibility')">{{ tt("capture.compatibility.openAccessibility") }}</button>
      <button type="button" class="btn prompt-action" @click="openPane('login-items')">{{ tt("autostart.openLoginItems") }}</button>
    </div>
    <div class="prompt-foot">
      <button type="button" class="btn primary prompt-dismiss" @click="dismiss">{{ tt("permissionPrompt.dismiss") }}</button>
    </div>
  </div>
</template>

<style scoped>
.prompt {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  height: 100vh;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg, #f2f2f7);
  color: var(--ink, #1c1c1e);
}

.prompt-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.prompt-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--muted);
}

.prompt-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-actions .btn {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border-radius: 12px;
}

.prompt-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
}

.prompt-dismiss {
  width: auto;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 999px;
}
</style>
