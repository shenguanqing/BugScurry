import { describe, expect, it } from "vitest";
import {
  emitNative,
  getWindowLabel,
  invokeNative,
  isTauri,
  listenNative,
  resolveWindowLabel,
} from "../desktop";

describe("desktop window label", () => {
  it("stays null off-runtime without throwing", async () => {
    expect(isTauri()).toBe(false);
    expect(getWindowLabel()).toBeNull();
    // Dynamic API import must degrade gracefully in node (zero static deps).
    await expect(resolveWindowLabel()).resolves.toBeNull();
    expect(getWindowLabel()).toBeNull();
  });
});

describe("desktop native bridge", () => {
  it("keeps off-runtime contracts without a runtime", async () => {
    await expect(invokeNative("get_os")).rejects.toThrow();
    const unlisten = await listenNative("x", () => {});
    expect(typeof unlisten).toBe("function");
    unlisten();
    await expect(emitNative("x", {})).resolves.toBeUndefined();
  });
});
