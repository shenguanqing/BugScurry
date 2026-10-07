import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCaptureMonitorStatus,
  requestCaptureInputMonitoring,
} from "../tauriBridge";

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));

describe("capture monitor bridge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reads the native screenshot listener status", async () => {
    const status = { supported: true, authorized: false, listening: false, accessibility: false, canRecord: false };
    tauri.invoke.mockResolvedValue(status);

    await expect(getCaptureMonitorStatus()).resolves.toEqual(status);
    expect(tauri.invoke).toHaveBeenCalledWith("get_capture_monitor_status");
  });

  it("requests Input Monitoring through the native command", async () => {
    const status = { supported: true, authorized: true, listening: true, accessibility: true, canRecord: true };
    tauri.invoke.mockResolvedValue(status);

    await expect(requestCaptureInputMonitoring()).resolves.toEqual(status);
    expect(tauri.invoke).toHaveBeenCalledWith("request_capture_input_monitoring");
  });
});
