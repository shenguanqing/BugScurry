import { ref, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { messages, resolveLocale, type Locale, type LocalePref } from "./messages";

export type { Locale, LocalePref };

const localeRef: Ref<Locale> = ref<Locale>("zh-CN");

export function currentLocale(): Locale {
  return localeRef.value;
}

export function t(key: string): string {
  return messages[localeRef.value][key] ?? messages.en[key] ?? key;
}

export function setLocalePref(pref: LocalePref): Locale {
  localeRef.value = resolveLocale(pref);
  return localeRef.value;
}

/** Push tray menu strings to the Rust shell. */
export async function syncTrayLocale(locale: Locale): Promise<void> {
  try {
    await invoke("apply_locale", {
      locale,
      labels: {
        toggle: t("tray.toggle"),
        add: t("tray.add"),
        remove: t("tray.remove"),
        regen: t("tray.regen"),
        bait: t("tray.bait"),
        feed: t("tray.feed"),
        sugar: t("tray.sugar"),
        fruit: t("tray.fruit"),
        rain: t("tray.rain"),
        rain_off: t("tray.rainOff"),
        rain_light: t("tray.rain.light"),
        rain_moderate: t("tray.rain.moderate"),
        rain_heavy: t("tray.rain.heavy"),
        rain_downpour: t("tray.rain.downpour"),
        rain_thunder: t("tray.rain.thunder"),
        rain_snow: t("tray.rain.snow"),
        rain_fog: t("tray.rain.fog"),
        rain_sand: t("tray.rain.sand"),
        spray: t("tray.prank.spray"),
        settings: t("tray.settings"),
        quit: t("tray.quit"),
        stats: t("tray.stats"),
      },
    });
  } catch (err) {
    console.error("apply_locale failed", err);
  }
}
