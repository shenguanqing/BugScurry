import { isTauri } from "../platform/desktop";
import { checkUpdateNow, getAppVersion, openUpdaterWindow } from "./tauriBridge";
import { loadSettings, saveSettings } from "./settingsService";

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** "v1.2.3" → "1.2.3"; trims build metadata for comparison. */
export function normalizeVersion(input: string): string {
  return input.trim().replace(/^v/i, "").split("+")[0];
}

function numericParts(version: string): number[] {
  return normalizeVersion(version)
    .split("-")[0]
    .split(".")
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
}

/** Semver-numeric compare; prerelease suffix ignored (stable wins ties). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = numericParts(a);
  const pb = numericParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  return compareVersions(current, latest) < 0;
}

/** Extract the `## [x.y.z]` section body from a Keep-a-Changelog file. */
export function extractReleaseNotes(changelog: string, version: string): string {
  const clean = normalizeVersion(version);
  if (!changelog || !clean) return "";
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = changelog.match(
    new RegExp(`## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`, ""),
  );
  return (match?.[1] ?? "").trim();
}

/**
 * Pick the bundled changelog matching the UI locale:
 * exact match → same base language → English → first available.
 */
export function pickLocalizedChangelog(
  locale: string,
  bundles: Record<string, string>,
  fallback = "en",
): string {
  const norm = locale.trim();
  if (norm && bundles[norm]) return bundles[norm];
  const base = norm.split(/[-_]/)[0].toLowerCase();
  if (base) {
    const hit = Object.keys(bundles).find(
      (key) =>
        key !== norm &&
        key.split(/[-_]/)[0].toLowerCase() === base &&
        bundles[key],
    );
    if (hit) return bundles[hit];
  }
  return bundles[fallback] ?? Object.values(bundles)[0] ?? "";
}

/**
 * Localized notes for a version. A missing section in the locale bundle
 * falls back to the English section (partial translations stay useful).
 */
export function extractLocalizedNotes(
  bundles: Record<string, string>,
  locale: string,
  version: string,
): string {
  const localized = extractReleaseNotes(
    pickLocalizedChangelog(locale, bundles),
    version,
  );
  if (localized) return localized;
  return extractReleaseNotes(bundles.en ?? "", version);
}

/**
 * Whether the permission re-grant dialog should pop on this launch.
 * Unsigned builds invalidate macOS authorizations on every update, so nag
 * every launch while capture compatibility is opted in but Input Monitoring
 * is not granted. Unknown state never nags; dismissing only closes the
 * dialog and the next launch nags again until fixed.
 */
export function shouldPromptPermissions(args: {
  captureCompatibilityEnabled: boolean;
  captureSupported: boolean | null;
  inputMonitoringAuthorized: boolean | null;
}): boolean {
  if (!args.captureCompatibilityEnabled) return false;
  if (args.captureSupported === false) return false;
  return args.inputMonitoringAuthorized === false;
}

/** Resident apps restart rarely: re-check daily even without relaunch. */
export function isUpdateCheckDue(
  lastCheck: number,
  now = Date.now(),
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (!Number.isFinite(lastCheck) || lastCheck <= 0) return true;
  return now - lastCheck >= intervalMs;
}

/**
 * Auto prompt iff enabled + strictly newer + not the skipped exact version.
 * Manual checks bypass the skip upstream (settings still shows "skipped").
 */
export function shouldAutoPrompt(args: {
  autoUpdate: boolean;
  current: string;
  latest: string;
  skippedVersion: string;
}): boolean {
  if (!args.autoUpdate) return false;
  if (!isNewerVersion(args.current, args.latest)) return false;
  return (
    normalizeVersion(args.latest) !== normalizeVersion(args.skippedVersion || "")
  );
}

export type UpdateCheckStatus =
  | "up-to-date"
  | "available"
  | "skipped"
  | "unavailable";

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  current: string;
  latest?: string;
  notes?: string;
}

/**
 * Overlay auto-check entry. Persists lastUpdateCheck; a real find opens
 * the dedicated updater window (it owns progress + changelog).
 */
export async function checkForUpdates(
  trigger: "auto" | "manual",
  getVersion?: () => Promise<string>,
): Promise<UpdateCheckResult> {
  if (!isTauri()) return { status: "unavailable", current: "web" };
  const settings = await loadSettings(false);
  const current = getVersion ? await getVersion() : await getAppVersion();
  if (trigger === "auto") {
    if (!settings.autoUpdate) return { status: "up-to-date", current };
    if (!isUpdateCheckDue(settings.lastUpdateCheck)) {
      return { status: "up-to-date", current };
    }
  }
  try {
    const found = await checkUpdateNow();
    await saveSettings({ ...settings, lastUpdateCheck: Date.now() });
    if (!found) return { status: "up-to-date", current };
    const skipped =
      normalizeVersion(found.version) ===
      normalizeVersion(settings.skippedVersion || "");
    if (skipped) return { status: "skipped", current, latest: found.version };
    if (trigger === "auto") {
      if (
        !shouldAutoPrompt({
          autoUpdate: settings.autoUpdate,
          current,
          latest: found.version,
          skippedVersion: settings.skippedVersion,
        })
      ) {
        return { status: "skipped", current, latest: found.version };
      }
      await openUpdaterWindow();
    }
    return {
      status: "available",
      current,
      latest: found.version,
      notes: found.body,
    };
  } catch (err) {
    console.error("update check failed", err);
    return { status: "up-to-date", current };
  }
}
