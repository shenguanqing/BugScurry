import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockTauriRuntime } from "./runtimeEnv";
import type { Event } from "@tauri-apps/api/event";
import { listenOverlayVisibility } from "../tauriBridge";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  emitTo: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: tauri.listen,
  emitTo: tauri.emitTo,
}));

describe("overlay visibility initialization", () => {
  let listeners: Set<(event: Event<boolean>) => void>;
  let cleanups: ReturnType<typeof vi.fn>[];

  function publish(visible: boolean) {
    for (const listener of listeners) {
      listener({ event: "overlay-visibility-changed", id: 1, payload: visible });
    }
  }

  beforeEach(() => {
    mockTauriRuntime();
    vi.resetAllMocks();
    listeners = new Set();
    cleanups = [];
    tauri.listen.mockImplementation(async (event, listener) => {
      expect(event).toBe("overlay-visibility-changed");
      listeners.add(listener);
      const cleanup = vi.fn(() => { listeners.delete(listener); });
      cleanups.push(cleanup);
      return cleanup;
    });
  });

  it("initializes new and rebuilt overlays as hidden without another tray toggle", async () => {
    tauri.invoke.mockResolvedValue(false);
    const newOverlay = vi.fn();
    const rebuiltOverlay = vi.fn();

    const stopNew = await listenOverlayVisibility(newOverlay);
    const stopRebuilt = await listenOverlayVisibility(rebuiltOverlay);

    expect(newOverlay.mock.calls).toEqual([[false]]);
    expect(rebuiltOverlay.mock.calls).toEqual([[false]]);
    expect(tauri.invoke).toHaveBeenCalledTimes(2);
    expect(tauri.invoke).toHaveBeenCalledWith("get_overlay_visible");
    stopNew();
    stopRebuilt();
  });

  it.each([
    { stale: true, current: false },
    { stale: false, current: true },
  ])("preserves the $current event when the pending getter returns stale $stale", async ({ stale, current }) => {
    let finishQuery!: (visible: boolean) => void;
    tauri.invoke.mockReturnValue(new Promise<boolean>((resolve) => { finishQuery = resolve; }));
    const applyVisibility = vi.fn();

    const initializing = listenOverlayVisibility(applyVisibility);
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith("get_overlay_visible"));
    expect(listeners.size).toBe(1);
    publish(current);
    finishQuery(stale);
    const stop = await initializing;

    expect(applyVisibility.mock.calls).toEqual([[current]]);
    publish(!current);
    expect(applyVisibility.mock.calls).toEqual([[current], [!current]]);
    stop();
  });

  it("removes the subscribed listener when the initial native query fails", async () => {
    tauri.invoke.mockRejectedValue(new Error("native visibility unavailable"));
    const applyVisibility = vi.fn();

    await expect(listenOverlayVisibility(applyVisibility)).rejects.toThrow("native visibility unavailable");

    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    publish(true);
    expect(applyVisibility).not.toHaveBeenCalled();
  });

  it("removes the listener when applying the queried initial state throws", async () => {
    tauri.invoke.mockResolvedValue(false);
    const applyVisibility = vi.fn(() => { throw new Error("initialization failed"); });

    await expect(listenOverlayVisibility(applyVisibility)).rejects.toThrow("initialization failed");

    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it("stops delivering changes after the overlay is torn down", async () => {
    tauri.invoke.mockResolvedValue(false);
    const applyVisibility = vi.fn();
    const stop = await listenOverlayVisibility(applyVisibility);
    publish(true);

    stop();
    publish(false);

    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(applyVisibility.mock.calls).toEqual([[false], [true]]);
  });
});
