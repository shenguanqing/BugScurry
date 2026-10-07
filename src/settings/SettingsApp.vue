<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LIMITS } from "../core/config";
import { RAIN_KIND_ORDER } from "../core/weather";
import type { FoodKind, Settings } from "../core/types";
import { t } from "../i18n";
import { getSpecies, listSpecies } from "../species";
import {
  beginHotkeyRecording,
  endHotkeyRecording,
  getCaptureMonitorStatus,
  keycodeToCode,
  listenHotkeyCaptured,
  openSystemSettingsPane,
} from "../services/tauriBridge";
import {
  enableCaptureCompatibility as enableNativeCaptureCompatibility,
  isCaptureCompatibilityReady,
  shouldPollCaptureStatus,
} from "../services/captureMonitorService";
import { hotkeyFromKeyboardEvent } from "../services/hotkeyRecording";
import SpeciesPreview from "./SpeciesPreview.vue";
import InfoTip from "./InfoTip.vue";
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

/**
 * Visual-family order for the picker (not pinyin): flyers → hard shells →
 * crawlers → soft bodies. New species append at the end via fallback rank.
 */
const SPECIES_UI_ORDER = [
  "butterfly",
  "bee",
  "firefly",
  "ladybug",
  "beetle",
  "cockroach",
  "ant",
  "spider",
  "fly",
  "mosquito",
  "caterpillar",
  "worm",
] as const;

/** Built-in species from the registry — order follows SPECIES_UI_ORDER. */
const speciesOptions = computed(() => {
  void localeVersion.value;
  const rank = new Map<string, number>(
    SPECIES_UI_ORDER.map((id, i) => [id, i]),
  );
  return listSpecies()
    .slice()
    .sort((a, b) => {
      const ra = rank.get(a.id) ?? SPECIES_UI_ORDER.length + 1;
      const rb = rank.get(b.id) ?? SPECIES_UI_ORDER.length + 1;
      return ra - rb || a.label.localeCompare(b.label, "zh-CN");
    })
    .map((s) => ({
      id: s.id,
      label: t(`species.${s.id}`) !== `species.${s.id}` ? t(`species.${s.id}`) : s.label,
      emoji: s.emoji,
    }));
});

const settings = reactive<Settings>({
  captureHotkeys: [],
  count: 1,
  size: 1,
  speed: 1,
  randomness: 0.5,
  sound: true,
  stains: true,
  particles: true,
  repellent: true,
  autostart: false,
  showInCaptures: false,
  captureCompatibilityEnabled: false,
  monitorMode: "primary",
  species: "random",
  theme: "auto",
  locale: "auto",
  rain: false,
  rainKind: "moderate",
  rainWind: 0,
  autoRain: false,
  randomEvents: false,
});

const foodEmoji: Record<FoodKind, string> = { cookie: "🍪", sugar: "🍬", fruit: "🍓" };
const personalities = ["shy", "greedy", "lazy", "curious"] as const;

const favoriteFood = computed(() => getSpecies(settings.species)?.traits.favoriteFood);

/** Shared catalog for native integration checks and the browser QA page. */
const weatherDebugKinds = RAIN_KIND_ORDER;

const randomWeatherTipLines = computed(() => {
  void localeVersion.value;
  return weatherDebugKinds.map((k) => tt(`tray.rain.${k}`));
});

/** Event pool listed in the Random-events info popover. */
const randomEventTipLines = computed(() => {
  void localeVersion.value;
  const kinds = ["swarm", "fat_invasion", "berserk", "size_chaos", "night_raid"] as const;
  return kinds.map(
    (k) => `${tt(`event.${k}.title`)} — ${tt(`event.${k}.subtitle`)}`,
  );
});

/** Capture tip as scannable bullets: permission, privacy, behavior, limits. */
const captureTipLines = computed(() => {
  void localeVersion.value;
  const keys = captureMonitorStatus.value?.supported
    ? ["keys", "permission", "limits"]
    : ["windows"];
  return keys.map(
    (k) => tt(`toggle.showInCaptures.tip.${k}`),
  );
});
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
const captureSavePending = ref(false);
const captureSaveFailed = ref(false);
const captureMonitorStatus = ref<Awaited<ReturnType<typeof getCaptureMonitorStatus>> | null>(null);
const capturePermissionPending = ref(false);
const capturePermissionRequestFailed = ref(false);
const hotkeyRecording = ref(false);
let hotkeyRecorderTimer = 0;
let unlistenHotkeyCaptured: UnlistenFn | null = null;
const captureCompatibilityReady = computed(() => settings.captureCompatibilityEnabled && isCaptureCompatibilityReady(captureMonitorStatus.value));

const HOTKEY_MOD_GLYPHS: Record<string, string> = { cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", fn: "Fn+" };

function formatHotkey(hotkey: { mods: string; code: string }): string {
  const key = hotkey.code.replace(/^Key|^Digit/, "");
  const glyphs = hotkey.mods
    .split("+")
    .filter(Boolean)
    .map((mod) => HOTKEY_MOD_GLYPHS[mod] ?? mod)
    .join("");
  return glyphs + key;
}

function hotkeyDisplayName(hotkey: { name?: string }): string {
  if (hotkey.name && HOTKEY_PRESET_KEYS.has(hotkey.name)) {
    return tt(`capture.hotkeys.preset.${hotkey.name}`);
  }
  return hotkey.name || tt("capture.hotkeys.custom");
}

const HOTKEY_PRESET_KEYS = new Set(["wechat", "snipaste"]);

const hotkeyNameEditing = ref<{ name?: string; mods: string; code: string } | null>(null);
const hotkeyNameDraft = ref("");
const hotkeyNameInput = ref<HTMLInputElement | null>(null);

function setHotkeyNameInput(element: unknown): void {
  hotkeyNameInput.value = element instanceof HTMLInputElement ? element : null;
}

function startHotkeyNameEdit(hotkey: { name?: string; mods: string; code: string }): void {
  // Presets store a stable id ("wechat") but display a localized label — edit
  // the label, not the id.
  hotkeyNameDraft.value =
    hotkey.name && HOTKEY_PRESET_KEYS.has(hotkey.name)
      ? hotkeyDisplayName(hotkey)
      : hotkey.name ?? "";
  hotkeyNameEditing.value = hotkey;
  void nextTick(() => {
    hotkeyNameInput.value?.focus();
    hotkeyNameInput.value?.select();
  });
}

function cancelHotkeyNameEdit(): void {
  hotkeyNameEditing.value = null;
  hotkeyNameDraft.value = "";
}

function commitHotkeyName(hotkey: { name?: string; mods: string; code: string }): void {
  if (hotkeyNameEditing.value !== hotkey) return;
  const name = hotkeyNameDraft.value.trim().slice(0, 24);
  hotkey.name = name || undefined;
  cancelHotkeyNameEdit();
  void persist();
}

function removeHotkey(hotkey: { name?: string; mods: string; code: string }): void {
  settings.captureHotkeys = settings.captureHotkeys.filter((h) => h !== hotkey);
  if (hotkeyNameEditing.value === hotkey) cancelHotkeyNameEdit();
  void persist();
}

/** The native tap swallows key-downs while recording and reports the combo. */
function stopHotkeyRecording(): void {
  window.clearTimeout(hotkeyRecorderTimer);
  hotkeyRecording.value = false;
  void endHotkeyRecording().catch((err) => console.error("end hotkey recording failed", err));
}

async function toggleHotkeyRecording(): Promise<void> {
  if (hotkeyRecording.value) {
    stopHotkeyRecording();
    return;
  }
  if (!captureMonitorStatus.value?.canRecord) return;
  hotkeyRecording.value = true;
  try {
    await beginHotkeyRecording();
    // Blur/cancel can happen while the native command is in flight.
    if (!hotkeyRecording.value) { await endHotkeyRecording(); return; }
  } catch (err) {
    console.error("begin hotkey recording failed", err);
    stopHotkeyRecording();
    captureSaveFailed.value = true;
    void refreshCaptureMonitorStatus();
    return;
  }
  // No input within 10s ends the recording (the native flag stays clean).
  window.clearTimeout(hotkeyRecorderTimer);
  hotkeyRecorderTimer = window.setTimeout(stopHotkeyRecording, 10000);
}

function saveRecordedHotkey(entry: { mods: string; code: string }): void {
  if (settings.captureHotkeys.some((h) => h.mods === entry.mods && h.code === entry.code)) return;
  settings.captureHotkeys = [...settings.captureHotkeys, { name: "", ...entry }];
  void persist().catch((err) => {
    captureSaveFailed.value = true;
    console.error("save recorded hotkey failed", err);
  });
}

function onHotkeyCaptured(payload: { mods: string; keycode: number; cancelled: boolean }): void {
  if (!hotkeyRecording.value) return;
  window.clearTimeout(hotkeyRecorderTimer);
  hotkeyRecording.value = false;
  if (payload.cancelled) return;
  const code = keycodeToCode(payload.keycode);
  if (code) saveRecordedHotkey({ mods: payload.mods, code });
}

function onRecordingKeyDown(event: KeyboardEvent): void {
  if (!hotkeyRecording.value) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "Escape") { stopHotkeyRecording(); return; }
  const entry = hotkeyFromKeyboardEvent(event);
  if (!entry || event.repeat) return;
  stopHotkeyRecording();
  saveRecordedHotkey(entry);
}
const showCaptureCompatibilityHint = computed(() => {
  const status = captureMonitorStatus.value;
  return !settings.showInCaptures && status?.supported && !captureCompatibilityReady.value;
});
let flashTimer: number | undefined;
let captureStatusTimer: number | undefined;
let captureStatusRefreshPending = false;
let captureStatusVersion = 0;
let settingsUnmounted = false;
let unlistenSettings: UnlistenFn | null = null;
let ignoreNextBroadcast = false;

function scheduleCaptureStatusRefresh(): void {
  window.clearTimeout(captureStatusTimer);
  if (settingsUnmounted || capturePermissionPending.value || !captureMonitorStatus.value?.supported) return;
  // A healthy listener needs no polling (each check is a TCC round-trip);
  // Window focus re-checks permissions; keep polling while a newly authorized
  // active tap is being installed, including when capture inclusion is on.
  const status = captureMonitorStatus.value;
  if (!settings.captureCompatibilityEnabled || !shouldPollCaptureStatus(status, settings.showInCaptures)) return;
  captureStatusTimer = window.setTimeout(() => {
    void refreshCaptureMonitorStatus();
  }, 1000);
}

async function refreshCaptureMonitorStatus(): Promise<void> {
  if (settingsUnmounted || captureStatusRefreshPending || capturePermissionPending.value) return;
  captureStatusRefreshPending = true;
  const version = ++captureStatusVersion;
  try {
    const status = await getCaptureMonitorStatus();
    if (!settingsUnmounted && version === captureStatusVersion) captureMonitorStatus.value = status;
  } catch (err) {
    console.error("capture monitor status failed", err);
  } finally {
    captureStatusRefreshPending = false;
    scheduleCaptureStatusRefresh();
  }
}

function onWindowFocus(): void {
  void refreshCaptureMonitorStatus();
}

function onWindowBlur(): void {
  if (hotkeyRecording.value) stopHotkeyRecording();
}

async function enableCaptureCompatibility(): Promise<void> {
  if (capturePermissionPending.value || !captureMonitorStatus.value?.supported) return;
  capturePermissionPending.value = true;
  capturePermissionRequestFailed.value = false;
  ++captureStatusVersion;
  window.clearTimeout(captureStatusTimer);
  try {
    settings.captureCompatibilityEnabled = true;
    await persist();
    const status = await enableNativeCaptureCompatibility();
    if (!settingsUnmounted) captureMonitorStatus.value = status;
  } catch (err) {
    capturePermissionRequestFailed.value = true;
    console.error("capture input monitoring request failed", err);
  } finally {
    capturePermissionPending.value = false;
    scheduleCaptureStatusRefresh();
  }
}

async function persist() {
  ignoreNextBroadcast = true;
  await saveSettings({ ...settings });
  captureSaveFailed.value = false;
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

function toggle(
  key: "sound" | "stains" | "particles" | "repellent" | "autoRain" | "randomEvents",
) {
  settings[key] = !settings[key];
  void persist();
}

async function toggleCaptureVisibility() {
  if (captureSavePending.value) return;
  const previous = settings.showInCaptures;
  captureSavePending.value = true;
  captureSaveFailed.value = false;
  savedFlash.value = false;
  settings.showInCaptures = !previous;
  try {
    await persist();
  } catch (err) {
    settings.showInCaptures = previous;
    ignoreNextBroadcast = false;
    savedFlash.value = false;
    captureSaveFailed.value = true;
    console.error("capture settings save failed", err);
  } finally {
    captureSavePending.value = false;
    // The hint's visibility depends on this preference — re-arm the poller.
    scheduleCaptureStatusRefresh();
  }
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

/** Hidden QA panel: click the footer note 5× within 1.5s. */
const debugOpen = ref(false);
let debugClicks = 0;
let debugClickTimer = 0;

function onFooterClick() {
  debugClicks += 1;
  window.clearTimeout(debugClickTimer);
  if (debugClicks >= 5) {
    debugClicks = 0;
    debugOpen.value = !debugOpen.value;
    return;
  }
  debugClickTimer = window.setTimeout(() => {
    debugClicks = 0;
  }, 1500);
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
  window.addEventListener("keydown", onRecordingKeyDown, true);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("blur", onWindowBlur);
  unlistenHotkeyCaptured = await listenHotkeyCaptured(onHotkeyCaptured);
  const loaded = await loadSettings();
  Object.assign(settings, loaded);
  void refreshCaptureMonitorStatus();
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
    // Another window may have flipped showInCaptures — re-arm the poller.
    scheduleCaptureStatusRefresh();
    void applyUiLocale(settings.locale).then(() => {
      localeVersion.value++;
      void syncWindowTitle();
    });
  });
});

onUnmounted(() => {
  settingsUnmounted = true;
  window.removeEventListener("keydown", onRecordingKeyDown, true);
  window.removeEventListener("focus", onWindowFocus);
  window.removeEventListener("blur", onWindowBlur);
  unlistenHotkeyCaptured?.();
  window.clearTimeout(hotkeyRecorderTimer);
  void endHotkeyRecording().catch((err) => console.error("end hotkey recording failed", err));
  window.clearTimeout(captureStatusTimer);
  window.clearTimeout(flashTimer);
  window.clearTimeout(debugClickTimer);
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
      <span class="badge" :class="{ on: savedFlash }" role="status" aria-live="polite">
        {{ captureSaveFailed ? tt("badge.failed") : savedFlash ? tt("badge.saved") : tt("badge.live") }}
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
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("toggle.repellent") }}</span>
            <InfoTip :text="tt('toggle.repellent.tip')" :label="tt('toggle.repellent')" />
          </div>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-repellent"
            :class="{ on: settings.repellent }"
            role="switch"
            :aria-checked="settings.repellent"
            :aria-label="tt('toggle.repellent')"
            @click="toggle('repellent')"
          ></button>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">{{ tt("toggle.sound") }}</span>
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
          <span class="toggle-label">{{ tt("toggle.stains") }}</span>
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
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("toggle.particles") }}</span>
            <InfoTip :text="tt('toggle.particles.tip')" :label="tt('toggle.particles')" />
          </div>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-particles"
            :class="{ on: settings.particles }"
            role="switch"
            :aria-checked="settings.particles"
            :aria-label="tt('toggle.particles')"
            @click="toggle('particles')"
          ></button>
        </div>
        <div class="toggle-row">
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("toggle.autoRain") }}</span>
            <InfoTip
              :label="tt('toggle.autoRain')"
              :text="tt('toggle.autoRain.tip')"
              :lines="randomWeatherTipLines"
            />
          </div>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-auto-rain"
            :class="{ on: settings.autoRain }"
            role="switch"
            :aria-checked="settings.autoRain"
            :aria-label="tt('toggle.autoRain')"
            @click="toggle('autoRain')"
          ></button>
        </div>
        <div class="toggle-row">
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("toggle.randomEvents") }}</span>
            <InfoTip
              :label="tt('toggle.randomEvents')"
              :text="tt('toggle.randomEvents.tip')"
              :lines="randomEventTipLines"
            />
          </div>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-random-events"
            :class="{ on: settings.randomEvents }"
            role="switch"
            :aria-checked="settings.randomEvents"
            :aria-label="tt('toggle.randomEvents')"
            @click="toggle('randomEvents')"
          ></button>
        </div>
      </div>
    </section>

    <section class="card list-card">
      <div class="toggles">
        <div class="toggle-row">
          <span class="toggle-label">{{ tt("toggle.autostart") }}</span>
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
    <div v-if="captureMonitorStatus?.supported" class="settings-footnote">
      <p class="hint">{{ tt("autostart.loginItemsHint") }}</p>
      <span class="compat-enable" @click="openSystemSettingsPane('login-items')">{{ tt("autostart.openLoginItems") }}</span>
    </div>

    <section class="card list-card">
      <div class="toggles">
        <div class="toggle-row">
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("toggle.showInCaptures") }}</span>
            <InfoTip
              :text="tt('toggle.showInCaptures.tip')"
              :lines="captureTipLines"
              :label="tt('toggle.showInCaptures')"
            />
          </div>
          <button
            type="button"
            class="toggle-switch"
            id="toggle-show-in-captures"
            :class="{ on: settings.showInCaptures }"
            role="switch"
            :aria-checked="settings.showInCaptures"
            :aria-label="tt('toggle.showInCaptures')"
            :aria-busy="captureSavePending"
            :disabled="captureSavePending"
            @click="toggleCaptureVisibility"
          ></button>
        </div>
      </div>
    </section>
    <div v-if="showCaptureCompatibilityHint" class="settings-footnote">
      <p class="hint" role="status" aria-live="polite">
        {{ capturePermissionRequestFailed
          ? tt("capture.compatibility.requestFailed")
          : !settings.captureCompatibilityEnabled
            ? tt("capture.compatibility.disabled")
            : captureMonitorStatus?.authorized || captureMonitorStatus?.accessibility
            ? tt("capture.compatibility.connecting")
            : tt("capture.compatibility.permissionHint") }}
      </p>
      <button
        type="button"
        class="compat-enable compat-enable--newline"
        :disabled="capturePermissionPending"
        @click="enableCaptureCompatibility"
      >{{ settings.captureCompatibilityEnabled && (captureMonitorStatus?.authorized || captureMonitorStatus?.accessibility)
        ? tt("capture.compatibility.retry")
        : tt("capture.compatibility.enable") }}</button>
    </div>
    <div v-if="captureMonitorStatus?.supported && !showCaptureCompatibilityHint" class="settings-footnote">
      <p v-if="captureCompatibilityReady" class="hint" role="status">{{ tt("capture.compatibility.enabled") }}</p>
      <button type="button" class="compat-enable" @click="openSystemSettingsPane('input-monitoring')">{{ tt("capture.compatibility.openInputMonitoring") }}</button>
    </div>

    <section v-if="captureMonitorStatus?.supported" class="card list-card">
      <div class="toggles">
        <div class="toggle-row">
          <div class="toggle-label-wrap">
            <span class="toggle-label">{{ tt("capture.hotkeys.title") }}</span>
              <InfoTip :text="tt('capture.hotkeys.tip')" :label="tt('capture.hotkeys.title')" />
            </div>
            <button
              type="button"
              class="compat-enable"
              :class="{ recording: hotkeyRecording }"
              :disabled="!hotkeyRecording && !captureMonitorStatus?.canRecord"
              :title="captureMonitorStatus?.canRecord
                ? tt('capture.hotkeys.add')
                : captureMonitorStatus?.accessibility
                  ? tt('capture.hotkeys.waiting')
                  : tt('capture.compatibility.accessibilityOff')"
              @click="toggleHotkeyRecording"
            >{{ hotkeyRecording ? tt("capture.hotkeys.recording") : tt("capture.hotkeys.add") }}</button>
          </div>
          <div v-if="settings.captureHotkeys.length" class="hotkey-rows">
            <div
              v-for="hotkey in settings.captureHotkeys"
              :key="hotkey.name + hotkey.mods + hotkey.code"
              class="hotkey-row"
            >
              <span class="hotkey-name">
                <input
                  v-if="hotkeyNameEditing === hotkey"
                  :ref="setHotkeyNameInput"
                  v-model="hotkeyNameDraft"
                  class="hotkey-name-input"
                  maxlength="24"
                  :aria-label="tt('capture.hotkeys.rename')"
                  @keydown.enter.prevent="commitHotkeyName(hotkey)"
                  @keydown.escape.prevent="cancelHotkeyNameEdit()"
                  @blur="commitHotkeyName(hotkey)"
                />
                <span
                  v-else
                  class="hotkey-name-editable"
                  :title="tt('capture.hotkeys.rename')"
                  @click="startHotkeyNameEdit(hotkey)"
                >{{ hotkeyDisplayName(hotkey) }}</span>
              </span>
              <span class="hotkey-combo">{{ formatHotkey(hotkey) }}</span>
              <button
                type="button"
                class="hotkey-remove"
                :aria-label="tt('capture.hotkeys.remove')"
                @click="removeHotkey(hotkey)"
              >×</button>
            </div>
          </div>
      </div>
    </section>
    <div v-if="settings.captureCompatibilityEnabled && captureMonitorStatus?.supported && captureMonitorStatus.accessibility && !captureMonitorStatus.canRecord" class="settings-footnote">
      <p class="hint" role="status">{{ tt("capture.hotkeys.waiting") }}</p>
      <button type="button" class="compat-enable" :disabled="capturePermissionPending" @click="enableCaptureCompatibility">{{ tt("capture.compatibility.retry") }}</button>
    </div>
    <div v-if="captureMonitorStatus?.supported" class="settings-footnote">
      <p class="hint" role="status">
        {{ captureMonitorStatus.accessibility ? tt("capture.compatibility.accessibilityOn") : tt("capture.compatibility.accessibilityOff") }}
      </p>
      <span class="compat-enable" @click="openSystemSettingsPane('accessibility')">{{ tt("capture.compatibility.openAccessibility") }}</span>
    </div>

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

    <section v-if="debugOpen" class="card debug-card" :aria-label="tt('debug.title')">
      <div class="debug-head">
        <div class="debug-head-row">
          <h2 class="debug-title">{{ tt("debug.title") }}</h2>
          <span class="debug-badge">DEV</span>
          <button
            type="button"
            class="debug-x"
            :aria-label="tt('debug.close')"
            :title="tt('debug.close')"
            @click="debugOpen = false"
          >×</button>
        </div>
        <p class="hint debug-hint">{{ tt("debug.hint") }}</p>
      </div>

      <div class="debug-group">
        <p class="debug-group-label">{{ tt("debug.group.weather") }}</p>
        <div class="debug-chips">
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_rain_random')">
            {{ tt("debug.rain") }}
          </button>
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_rain_stop')">
            {{ tt("debug.rainStop") }}
          </button>
          <button
            v-for="kind in weatherDebugKinds"
            :key="kind"
            type="button"
            class="debug-chip"
            @click="void sendOverlayCommand(`debug_weather:${kind}`)"
          >
            {{ tt(`tray.rain.${kind}`) }}
          </button>
        </div>
      </div>

      <div class="debug-group">
        <p class="debug-group-label">{{ tt("debug.group.events") }}</p>
        <div class="debug-chips">
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_event:swarm')">
            {{ tt("event.swarm.title") }}
          </button>
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_event:fat_invasion')">
            {{ tt("event.fat_invasion.title") }}
          </button>
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_event:berserk')">
            {{ tt("event.berserk.title") }}
          </button>
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_event:size_chaos')">
            {{ tt("event.size_chaos.title") }}
          </button>
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_event:night_raid')">
            {{ tt("event.night_raid.title") }}
          </button>
        </div>
      </div>

      <div class="debug-group">
        <p class="debug-group-label">{{ tt("debug.group.tools") }}</p>
        <div class="debug-chips">
          <button type="button" class="debug-chip" @click="void sendOverlayCommand('debug_spray')">
            {{ tt("debug.spray") }}
          </button>
        </div>
      </div>
    </section>

    <footer class="footer footer-hot" @click="onFooterClick">
      {{ tt("footer") }}
    </footer>
  </div>
</template>
