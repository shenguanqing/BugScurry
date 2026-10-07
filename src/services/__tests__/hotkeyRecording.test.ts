import { describe, expect, it } from "vitest";
import { hotkeyFromKeyboardEvent } from "../hotkeyRecording";
const event = (code: string, flags = {}) => ({
  code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
  getModifierState: () => false, ...flags,
});
describe("focused shortcut recording", () => {
  it("waits for a non-modifier key", () => {
    for (const code of ["ShiftLeft", "ControlRight", "MetaLeft", "AltRight", "Fn", ""]) {
      expect(hotkeyFromKeyboardEvent(event(code))).toBeNull();
    }
  });
  it("uses the same canonical modifiers as native recording, including Fn", () => {
    expect(hotkeyFromKeyboardEvent(event("KeyK", {
      metaKey: true, ctrlKey: true, getModifierState: (key: string) => key === "Fn",
    }))).toEqual({ mods: "cmd+ctrl+fn", code: "KeyK" });
    expect(hotkeyFromKeyboardEvent(event("F1"))).toEqual({ mods: "", code: "F1" });
  });
});
