import { describe, expect, it } from "vitest";
import { clampSettings } from "../../core/settings";
import {
  compareVersions,
  extractLocalizedNotes,
  isNewerVersion,
  isUpdateCheckDue,
  normalizeVersion,
  pickLocalizedChangelog,
  shouldAutoPrompt,
  shouldPromptPermissions,
  UPDATE_CHECK_INTERVAL_MS,
} from "../updaterService";

describe("updater versions", () => {
  it("strips leading v and build metadata", () => {
    expect(normalizeVersion("v0.6.2")).toBe("0.6.2");
    expect(normalizeVersion(" 1.0.0+build ")).toBe("1.0.0");
  });

  it("compares semver numerically", () => {
    expect(compareVersions("0.6.2", "0.7.0")).toBe(-1);
    expect(compareVersions("0.7.0", "0.6.2")).toBe(1);
    expect(compareVersions("0.6.2", "0.6.2")).toBe(0);
    expect(compareVersions("0.6.10", "0.6.9")).toBe(1);
    expect(compareVersions("v0.6.2", "0.6.2")).toBe(0);
  });

  it("detects newer releases only", () => {
    expect(isNewerVersion("0.6.2", "0.7.0")).toBe(true);
    expect(isNewerVersion("0.7.0", "0.6.2")).toBe(false);
    expect(isNewerVersion("0.6.2", "0.6.2")).toBe(false);
    expect(isNewerVersion("", "0.7.0")).toBe(false);
  });
});

describe("update check scheduling", () => {
  it("is due on first run and after 24h", () => {
    const now = 1_700_000_000_000;
    expect(isUpdateCheckDue(0, now)).toBe(true);
    expect(isUpdateCheckDue(now - UPDATE_CHECK_INTERVAL_MS - 1, now)).toBe(true);
    expect(isUpdateCheckDue(now - 1000, now)).toBe(false);
  });
});

describe("skip semantics", () => {
  it("prompts for new versions unless skipped or disabled", () => {
    const base = {
      autoUpdate: true,
      current: "0.6.2",
      latest: "0.7.0",
      skippedVersion: "",
    };
    expect(shouldAutoPrompt(base)).toBe(true);
    expect(shouldAutoPrompt({ ...base, skippedVersion: "0.7.0" })).toBe(false);
    // A newer release re-arms the prompt even with an old skip stored.
    expect(
      shouldAutoPrompt({ ...base, latest: "0.7.1", skippedVersion: "0.7.0" }),
    ).toBe(true);
    expect(shouldAutoPrompt({ ...base, autoUpdate: false })).toBe(false);
    expect(shouldAutoPrompt({ ...base, latest: "0.6.2" })).toBe(false);
  });
});

describe("localized changelogs", () => {
  const bundles = {
    en: "## [1.0.0]\n\nHello\n",
    "zh-CN": "## [1.0.0]\n\n你好\n",
  };

  it("prefers exact locale, then base language, then English", () => {
    expect(pickLocalizedChangelog("zh-CN", bundles)).toBe(bundles["zh-CN"]);
    expect(pickLocalizedChangelog("zh-HK", bundles)).toBe(bundles["zh-CN"]);
    expect(pickLocalizedChangelog("ja", bundles)).toBe(bundles.en);
    expect(pickLocalizedChangelog("", bundles)).toBe(bundles.en);
  });

  it("falls back to the English section when missing", () => {
    expect(extractLocalizedNotes(bundles, "zh-CN", "1.0.0")).toContain("你好");
    expect(extractLocalizedNotes({ en: bundles.en }, "zh-CN", "1.0.0")).toContain("Hello");
    expect(extractLocalizedNotes(bundles, "ja", "9.9.9")).toBe("");
  });
});

describe("post-update permission prompt", () => {
  const granted = {
    captureCompatibilityEnabled: true,
    captureSupported: true,
    inputMonitoringAuthorized: true,
  };
  it("nags every launch while opted in but not granted", () => {
    expect(
      shouldPromptPermissions({
        ...granted,
        inputMonitoringAuthorized: false,
      }),
    ).toBe(true);
  });

  it("stays quiet when granted, opted out, unsupported, or unknown", () => {
    expect(shouldPromptPermissions(granted)).toBe(false);
    expect(
      shouldPromptPermissions({ ...granted, captureCompatibilityEnabled: false }),
    ).toBe(false);
    expect(
      shouldPromptPermissions({
        ...granted,
        captureSupported: false,
        inputMonitoringAuthorized: false,
      }),
    ).toBe(false);
    expect(
      shouldPromptPermissions({ ...granted, inputMonitoringAuthorized: null }),
    ).toBe(false);
  });
});

describe("updater settings clamp", () => {
  it("defaults auto-update on and skip empty", () => {
    const s = clampSettings({});
    expect(s.autoUpdate).toBe(true);
    expect(s.skippedVersion).toBe("");
    expect(s.lastUpdateCheck).toBe(0);
  });

  it("normalizes skip + timestamp", () => {
    const s = clampSettings({
      autoUpdate: false,
      skippedVersion: "  v0.7.0  ",
      lastUpdateCheck: -5,
    });
    expect(s.autoUpdate).toBe(false);
    expect(s.skippedVersion).toBe("v0.7.0");
    expect(s.lastUpdateCheck).toBe(0);
  });
});
