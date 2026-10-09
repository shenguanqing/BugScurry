import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockTauriRuntime } from "./runtimeEnv";
import { listenCursorLocal, requestOverlayCursor } from "../tauriBridge";

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: native.listen }));

describe("stationary cursor initialization", () => {
  beforeEach(() => {
    mockTauriRuntime();
    vi.resetAllMocks(); });

  it("subscribes before asking the native poller to replay cached coordinates", async () => {
    let finishSubscription!: (cleanup: () => void) => void;
    let publish!: (event: { payload: { x: number; y: number; inside: boolean } }) => void;
    native.listen.mockImplementation((_event, listener) => {
      publish = listener;
      return new Promise<() => void>((resolve) => { finishSubscription = resolve; });
    });
    const cursor = { x: 100, y: 200, inside: true };
    native.invoke.mockImplementation(async () => { publish({ payload: cursor }); });
    const apply = vi.fn();
    const cleanup = vi.fn();

    const subscribing = listenCursorLocal(apply);
    expect(native.invoke).not.toHaveBeenCalled();
    finishSubscription(cleanup);
    const stop = await subscribing;

    expect(native.listen).toHaveBeenCalledWith("cursor-local", expect.any(Function));
    expect(native.invoke).toHaveBeenCalledWith("request_overlay_cursor");
    expect(apply).toHaveBeenCalledWith(cursor);
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("removes the listener if the initial replay request fails", async () => {
    const cleanup = vi.fn();
    native.listen.mockResolvedValue(cleanup);
    native.invoke.mockRejectedValue(new Error("replay failed"));

    await expect(listenCursorLocal(vi.fn())).rejects.toThrow("replay failed");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("can request another replay after visibility clears the frontend cache", async () => {
    native.listen.mockResolvedValue(vi.fn());
    await listenCursorLocal(vi.fn());
    await requestOverlayCursor();
    expect(native.invoke).toHaveBeenCalledTimes(2);
  });
});
