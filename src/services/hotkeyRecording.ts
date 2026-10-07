/** Local fallback for focused settings; native recording still handles global keys. */
export function hotkeyFromKeyboardEvent(event: Pick<KeyboardEvent,
  "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "getModifierState"
>): { mods: string; code: string } | null {
  if (/^(Shift|Control|Alt|Meta|Fn)/.test(event.code) || !event.code) return null;
  const mods = [
    ["cmd", event.metaKey], ["ctrl", event.ctrlKey], ["alt", event.altKey],
    ["shift", event.shiftKey], ["fn", event.getModifierState("Fn")],
  ].filter(([, pressed]) => pressed).map(([name]) => name).join("+");
  return { mods, code: event.code };
}
