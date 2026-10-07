import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureMonitorStatus } from "../tauriBridge";
import {
  enableCaptureCompatibility,
  isCaptureCompatibilityReady,
  shouldPollCaptureStatus,
} from "../captureMonitorService";

const native = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), open: vi.fn() }));
vi.mock("../tauriBridge", () => ({
  requestCaptureInputMonitoring: native.request,
  getCaptureMonitorStatus: native.refresh,
  openSystemSettingsPane: native.open,
}));

const status = (patch: Partial<CaptureMonitorStatus> = {}): CaptureMonitorStatus => ({
  supported: true, authorized: false, accessibility: false, listening: false, canRecord: false,
  ...patch,
});

describe("capture compatibility permissions", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  /** The enable flow waits ~1s for the one-time system alert before re-checking. */
  async function enableWithSettledClock(): Promise<CaptureMonitorStatus> {
    vi.useFakeTimers();
    try {
      const pending = enableCaptureCompatibility();
      await vi.advanceTimersByTimeAsync(1000);
      return await pending;
    } finally {
      vi.useRealTimers();
    }
  }

  it("enables compatibility through Accessibility alone without claiming Input Monitoring is granted", async () => {
    const active = status({ accessibility: true, listening: true, canRecord: true });
    native.request.mockResolvedValue(status());
    native.refresh.mockResolvedValue(active);
    const next = await enableWithSettledClock();

    expect(isCaptureCompatibilityReady(next)).toBe(true);
    expect(next.authorized).toBe(false);
    expect(next.canRecord).toBe(true);
    expect(native.open).not.toHaveBeenCalled();
    expect(shouldPollCaptureStatus(next, false)).toBe(false);
  });

  it("allows passive screenshot detection with Input Monitoring alone, without enabling recording", () => {
    const passive = status({ authorized: true, listening: true });
    expect(isCaptureCompatibilityReady(passive)).toBe(true);
    expect(passive.canRecord).toBe(false);
    expect(shouldPollCaptureStatus(passive, false)).toBe(false);
  });

  it("opens Input Monitoring settings when a repeated or denied request gives no authorization", async () => {
    native.request.mockResolvedValue(status());
    native.refresh.mockResolvedValue(status());
    expect(isCaptureCompatibilityReady(await enableWithSettledClock())).toBe(false);
    expect(native.open).toHaveBeenCalledWith("input-monitoring");
  });

  it.each([false, true])("keeps refreshing an Accessibility-only listener that is starting (capture inclusion: %s)", (inclusion) => {
    const pending = status({ accessibility: true });
    expect(isCaptureCompatibilityReady(pending)).toBe(false);
    expect(shouldPollCaptureStatus(pending, inclusion)).toBe(true);
  });

  it("continues refreshing while an authorized recorder is still using a passive listener", () => {
    const upgrading = status({ authorized: true, accessibility: true, listening: true });
    expect(shouldPollCaptureStatus(upgrading, false)).toBe(true);
  });

  it("supports retrying an already-authorized listener without opening an unrelated permission pane", async () => {
    const pending = status({ authorized: true });
    native.request.mockResolvedValue(status());
    native.refresh.mockResolvedValue(pending);
    await expect(enableWithSettledClock()).resolves.toEqual(pending);
    expect(native.request).toHaveBeenCalledOnce();
    expect(native.open).not.toHaveBeenCalled();
  });

  it("propagates permission request failures so the UI can display them", async () => {
    native.request.mockRejectedValue(new Error("permission request failed"));
    await expect(enableCaptureCompatibility()).rejects.toThrow("permission request failed");
    expect(native.open).not.toHaveBeenCalled();
  });

  it("does not poll macOS permissions on Windows", () => {
    const windows = status({ supported: false });
    expect(shouldPollCaptureStatus(windows, false)).toBe(false);
  });
});
