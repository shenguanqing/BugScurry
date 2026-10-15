<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { isTauri, setWindowTitle } from "../platform/desktop";
import { t } from "../i18n";
import {
  checkUpdateNow,
  downloadAndInstallUpdate,
  getAppVersion,
  relaunchApp,
} from "../services/tauriBridge";
import { isNewerVersion, normalizeVersion } from "../services/updaterService";
import {
  applyThemeToDocument,
  applyUiLocale,
  listenSettings,
  loadSettings,
  saveSettings,
} from "../services/settingsService";

const isDesktop = isTauri();

/** Force re-render of t() strings when locale changes. */
const localeVersion = ref(0);
function tt(key: string): string {
  void localeVersion.value;
  return t(key);
}

type Status =
  | "checking"
  | "up-to-date"
  | "available"
  | "skipped"
  | "downloading"
  | "ready"
  | "error";

const appVersion = ref("");
const latestVersion = ref("");
const latestNotes = ref("");
const skippedVersion = ref("");
const status = ref<Status>("checking");
const downloaded = ref(0);
const total = ref<number | null>(null);
let unlistenSettings: UnlistenFn | null = null;

const percent = computed(() => {
  if (!total.value || total.value <= 1 || downloaded.value <= 0) return null;
  return Math.min(100, Math.round((downloaded.value / total.value) * 100));
});

async function runCheck(): Promise<void> {
  if (!isDesktop || status.value === "downloading") return;
  status.value = "checking";
  try {
    const [current, found] = await Promise.all([getAppVersion(), checkUpdateNow()]);
    appVersion.value = current;
    if (!found || !isNewerVersion(current, found.version)) {
      status.value = "up-to-date";
      latestVersion.value = "";
      latestNotes.value = "";
      return;
    }
    latestVersion.value = found.version;
    latestNotes.value = found.body ?? "";
    const settings = await loadSettings(false);
    skippedVersion.value = settings.skippedVersion;
    status.value =
      normalizeVersion(found.version) ===
      normalizeVersion(settings.skippedVersion || "")
        ? "skipped"
        : "available";
  } catch (err) {
    console.error("update check failed", err);
    status.value = "error";
  }
}

async function download(): Promise<void> {
  if (status.value !== "available") return;
  status.value = "downloading";
  downloaded.value = 0;
  total.value = null;
  try {
    await downloadAndInstallUpdate((chunk, contentTotal) => {
      if (contentTotal === 1) {
        downloaded.value = 1;
        total.value = 1;
        return;
      }
      downloaded.value += chunk;
      if (typeof contentTotal === "number" && contentTotal > 0) {
        total.value = contentTotal;
      }
    });
    status.value = "ready";
  } catch (err) {
    console.error("update download failed", err);
    status.value = "error";
  }
}

async function restart(): Promise<void> {
  try {
    await relaunchApp();
  } catch (err) {
    console.error("relaunch failed", err);
    status.value = "error";
  }
}

async function skip(): Promise<void> {
  if (!latestVersion.value) return;
  const settings = await loadSettings(false);
  await saveSettings({ ...settings, skippedVersion: latestVersion.value });
  skippedVersion.value = latestVersion.value;
  status.value = "skipped";
}

async function unskip(): Promise<void> {
  const settings = await loadSettings(false);
  await saveSettings({ ...settings, skippedVersion: "" });
  skippedVersion.value = "";
  status.value = latestVersion.value ? "available" : "up-to-date";
}

async function syncWindowTitle(): Promise<void> {
  const title = t("update.title");
  document.title = title;
  setWindowTitle(title);
}

onMounted(async () => {
  const loaded = await loadSettings(false);
  skippedVersion.value = loaded.skippedVersion;
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
  await runCheck();
});

onUnmounted(() => {
  unlistenSettings?.();
});
</script>

<template>
  <div class="updater">
    <div class="up-left">
      <img class="up-icon" src="/icon-192.png" alt="BugScurry" />
      <p class="up-name">BugScurry</p>
      <p class="up-ver" v-if="appVersion">
        v{{ appVersion }}<template v-if="latestVersion"> → v{{ latestVersion }}</template>
      </p>
      <div v-if="status === 'downloading'" class="up-progress" role="progressbar" aria-label="download">
        <div class="up-progress-track">
          <div class="up-progress-fill" :style="{ width: `${percent ?? 0}%` }" />
        </div>
        <p class="hint">{{ tt("update.downloading") }}<template v-if="percent !== null"> {{ percent }}%</template></p>
      </div>
      <p v-else-if="status === 'checking'" class="hint" role="status">{{ tt("update.checking") }}</p>
      <p v-else-if="status === 'up-to-date'" class="hint" role="status">{{ tt("update.upToDate") }}</p>
      <p v-else-if="status === 'error'" class="hint" role="alert">{{ tt("update.error") }}</p>
      <p v-else-if="status === 'ready'" class="hint" role="status">{{ tt("update.ready") }}</p>
      <div class="up-actions">
        <button
          v-if="status === 'available'"
          type="button"
          class="btn primary"
          @click="download"
        >{{ tt("update.downloadInstall") }}</button>
        <button
          v-if="status === 'ready'"
          type="button"
          class="btn primary"
          @click="restart"
        >{{ tt("update.restart") }}</button>
        <button
          v-if="status === 'error' || status === 'up-to-date'"
          type="button"
          class="btn"
          @click="runCheck"
        >{{ tt("update.check") }}</button>
        <button
          v-if="status === 'available'"
          type="button"
          class="compat-enable muted"
          @click="skip"
        >{{ tt("update.skip") }}</button>
        <button
          v-if="status === 'skipped'"
          type="button"
          class="compat-enable muted"
          @click="unskip"
        >{{ tt("update.unskip") }}</button>
      </div>
    </div>
    <div class="up-right">
      <h2 class="up-notes-title">{{ tt("update.notesTitle") }}</h2>
      <p v-if="status === 'skipped'" class="hint" role="status">{{ tt("update.skipped") }}</p>
      <pre v-if="latestNotes" class="up-notes">{{ latestNotes }}</pre>
      <p v-else class="hint">{{ tt("update.upToDate") }}</p>
    </div>
  </div>
</template>

<style scoped>
.updater {
  display: flex;
  min-height: 100vh;
  background: var(--bg, #f2f2f7);
  color: var(--ink, #1c1c1e);
}

.up-left {
  width: 228px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 20px;
  text-align: center;
  border-right: 1px solid var(--line);
}

.up-icon {
  width: 96px;
  height: 96px;
  border-radius: 22px;
}

.up-name {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 700;
}

.up-ver {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.up-progress {
  width: 100%;
  margin-top: 8px;
}

.up-progress-track {
  height: 6px;
  border-radius: 3px;
  background: var(--fill);
  overflow: hidden;
}

.up-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.2s ease;
}

.up-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  margin-top: 8px;
  width: 100%;
}

.up-actions .btn {
  width: 100%;
}

.up-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 20px 16px;
  overflow: hidden;
}

.up-notes-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.up-notes {
  margin: 0;
  flex: 1;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.65;
  font-family: inherit;
  color: var(--ink, #1c1c1e);
}
</style>
