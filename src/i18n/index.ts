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
        settings: t("tray.settings"),
        quit: t("tray.quit"),
      },
    });
  } catch (err) {
    console.error("apply_locale failed", err);
  }
}
