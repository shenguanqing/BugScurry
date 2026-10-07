# Architecture

[中文](architecture.zh-CN.md)

For a file-layout tree, see the **Project Structure** section in [README.md](../README.md). This document describes **principles, data flow, and module responsibilities** — not a duplicate file listing.

## 1. Design principles

1. **Shell vs domain** — Tauri owns windows, tray, native events, cursor forwarding. Bug simulation and drawing live in the frontend and stay portable.
2. **No reactive hot path** — the rAF loop mutates plain `Bug[]` data. Vue is only for settings UI.
3. **Entity vs systems** — `Bug` is data; Movement / Renderer / HitTest / Squish / Audio are systems.
4. **Platform isolation** — DPI, multi-monitor, pass-through, Spaces live in `src-tauri` and `tauriBridge`, not in gameplay code.
5. **Extensible species** — new bugs = draw + traits in `src/species`, no main-loop forks.

## 2. Runtime overview

```text
Tray / Settings UI
        │
        ▼
 settingsService ──emit──► overlay App.vue
        │                      │
        │                      ▼
        │                 BugManager ──► Bug[]
        │                      │
        │         ┌────────────┼────────────┐
        │         ▼            ▼            ▼
        │     Movement      HitTest      Squish
        │         │            │            │
        │         └────► Renderer ◄─────────┘
        │                    │
        │                    ▼
        │                Canvas frame
        │
        └── store (settings.json)
```

Shell (Rust):

```text
lib.rs
  ├── overlay window(s)  — transparent, topmost, pass-through
  ├── cursor poller      — per-window local coords → cursor-local
  ├── monitor fit        — CGDisplayBounds (macOS) / physical (Windows)
  └── commands           — clickable, settings, monitor mode, quit

tray.rs
  ├── show/hide → native overlay visibility + overlay-visibility-changed
  └── other menu actions → tray-command events → overlay
```

## 3. Module responsibilities

| Module | Path | Responsibility |
|--------|------|----------------|
| Bug | `src/core/bug.ts` | Entity factory (position, heading, size, species, state, carry) |
| BugManager | `src/core/bugManager.ts` | List, count edits, clear, regenerate, squish FX, nibble FX, juice blots; **no auto-replace after death** |
| Settings clamp | `src/core/settings.ts` | Pure settings normalization (no Tauri imports) |
| Personality / Feeding | `src/core/personality.ts`, `src/core/feeding.ts` | Spawn-time personality; `resolveEatPlan` stacks species `eatStyle` on personality; food selection by distance + `favoriteFood` |
| Weather | `src/core/weather.ts` | Local-clock `DayPhase` weights; rain kind profiles, wind, lightning envelope, auto-rain clock |
| Rain audio / textures | `src/core/rainAudio.ts`, `src/core/rainTexture.ts` | Procedural rain + thunder and separate dry wind/grit for sand; fog is silent. Cached loop textures, throttled gust mixing (no per-drop synthesis in rAF) |
| Atmosphere | `src/core/atmosphere.ts` | Cached seamless turbulence for fog/dust; horizontal sand advection and shared visual/audio gust envelope |
| Movement | `src/core/movement.ts` | Crawl / pause / turn / corner escape / edge-hug / rain cover / nibble & carry haul |
| Renderer | `src/core/renderer.ts` | Canvas draw, squish transform, stains, particles, rain streaks, lightning, carried crumbs; delegates species `draw` |
| HitTest | `src/core/hitTest.ts` | Pointer vs bug radius |
| Squish | `src/core/squish.ts` | `squishing` → `dying` progress |
| Audio | `src/core/audio.ts` | Short Web Audio “snap” / hurt |
| Loop | `src/core/loop.ts` | rAF update + render; primary `onFrame` drives rain audio |
| Species | `src/species/*` | Registry, traits (`favoriteFood`, `activity`, `eatStyle`), per-species drawing; shared `contactShadow` / `glint` / `shell` highlights |
| Settings UI | `src/settings/*` | Settings window |
| Services | `src/services/*` | Tauri events/commands, store, theme, monitors |
| DailyStatsService | `src/services/dailyStatsService.ts` | Primary-overlay owner: queue kills, serialize store writes, refresh tray stats |
| Prank / random events | `BugManager.sprayKillAll` / `startSwarm` / `startFatInvasion` / `startBerserk` / `startSizeChaos` / `startNightRaid`; `randomEvents.ts` | Tray spray + in-place cooldown; Settings random-event pool (tide/fat/berserk/size/night); temp state never writes `settings.count` |
| Shell | `src-tauri/src/lib.rs` | Windows, cursor, monitors, commands, overlay/settings z-order |
| Tray | `src-tauri/src/tray.rs` | Menu bar / tray (feed, weather, spray) |

## 4. Bug state machine

```text
crawling ⇄ paused
    │
    ▼ (click)
squishing → dying → removed (not respawned)
```

Population changes only via: count increase, tray `+`, regenerate, or clear/reset. Squished bugs stay gone.

## 5. Coordinates

| Space | Use |
|-------|-----|
| Logical CSS px | Simulation, hit-test, settings size/speed |
| Physical px | Canvas backing store (`css * dpr`) |
| macOS cursor | CGEvent global **points** |
| Windows cursor | Global **physical** pixels |

Local cursor for a window:

- macOS: `points - origin_physical / scale`
- Windows: `(physical - origin_physical) / scale`

Viewport for drawing uses `window.innerWidth/innerHeight` + `devicePixelRatio`.

## 6. Mouse pass-through

```text
Rust poller → cursor-local {x,y,inside} per overlay (deduped per window)
                     │
frontend caches payload, hit test runs per rAF frame
                     ├─ hit  → setIgnoreCursorEvents(false) → click → squish
                     └─ miss → setIgnoreCursorEvents(true)
```

The poller skips a window's emit while the computed payload is bit-identical to the last one; overlay geometry or visibility changes bump a layout epoch that clears this cache. Bugs move under a stationary cursor, so the frontend evaluates hover per rAF frame from the cached payload — cursor events only refresh the data. Pass-through flips only when hover state changes. Overlay windows are `focusable: false`.

## 7. Settings sync

1. UI / tray mutates settings → `saveSettings` → store + `settings-changed`
2. Overlay applies (size live-rescale, count add/remove only on count change)
3. Settings window listens and refreshes its form
4. Theme / sound / etc. never lift the “cleared” state

## 8. Daily stats (multi-display)

```text
any overlay kill → emitTo("overlay", "bug-killed", {date, combo})
                        │
primary overlay  ───────┘
  dailyStatsService.record()
        ├─ in-memory accumulate (kills · bestCombo)
        └─ serial queue → store.set + setTrayStats
```

Only the window labeled `overlay` owns persistence. Secondary displays (`overlay-1`, …) only report; a failed write does not drop later kills.

## 9. Settings vs overlay z-order

Opening settings must **not** demote the overlay. The overlay stays `always_on_top` so bugs remain visible; settings is shown, raised, and focused. The overlay is click-through except when the cursor is over a bug, so the panel stays usable underneath the transparent layer.

**Always run (F-SET-11) is tray residency, not a toggle.** Closing settings only hides the panel; the process exits only via tray Quit / `Ctrl+Q`. Login autostart is separate (F-SET-10).

## 9.1 Sleep / wake recovery

```text
cursor poller thread
  records Instant each loop
        │
        ▼ gap ≥ 2s (system sleep froze the thread)
  emit("system-resumed") to every overlay* window
  set_overlays_always_on_top(true)
  clear display fingerprint and emit("displays-changed") to primary immediately
        │
        ▼
primary overlay frontend
  recoverFromSystemResume()
    ├─ forceRebuildOverlays(mode) ×2 (~250ms / 1.1s)
    │    close every overlay-* then recreate by mode
    │    (same path as toggling multi-monitor in settings;
    │     re-configuring the old window is not enough)
    ├─ refreshViewport + resizeCanvas
    └─ ensureAudio / rainAudio resumes a suspended AudioContext in-frame
```

The first rAF `dt` after wake is huge and already clamped by `MAX_DT`, so bugs do not teleport. The event is debounced for 4s. After sleep, secondary overlay WebViews can become zombies (blank canvas / stale geometry) — they must be closed and recreated, not merely resized.

## 9.2 Overlay visibility

Effective visibility is `user_visible && (show_in_captures || !capture_ui_active)`: the tray choice, the capture opt-in, and temporary screenshot suppression are three independent flags. Tray show/hide applies the result with native `show()` / `hide()` on every overlay window, then broadcasts `overlay-visibility-changed`. Hiding only the canvas would leave a transparent topmost window selectable by macOS window capture.

- After Show, the frontend calls `request_overlay_cursor`, invalidating the native cursor cache so even a stationary cursor is replayed.
- Each overlay subscribes via `listenOverlayVisibility` before querying `get_overlay_visible`, so new or rebuilt WebViews initialize from the current flag (an event arriving mid-query wins). rAF, audio, and the Rust cursor poller all follow this one flag — nothing depends on a frontend listener.
- Monitor changes and sleep/wake rebuilds preserve both flags; opening settings changes nothing; ending a capture session never overrides a manual Hide.

## 9.3 Capture preference

`Settings.showInCaptures` defaults to `false` (only literal `true` opts in). It is persisted independently of the tray visibility choice, covers bugs, weather, and effects on every overlay including rebuilds, and never affects the settings window.

**Detection (macOS).** `macos_capture.rs` watches input with a `CGEventTap` — passive with Input Monitoring alone, active with Accessibility alone. It only compares key codes and modifier flags against the screenshot shortcuts: never reads text, stores nothing, passes events through untouched. The one exception is custom-key recording, which swallows key-downs for a few seconds (the combo goes to the settings window, then is discarded). Permission is preflighted at startup (`CGPreflightListenEventAccess`) and requested from the settings window (`CGRequestListenEventAccess`); the UI reports the real `listening` / `canRecord` flags. Status refresh restarts or reconfigures the tap after permission changes; a denied or repeated request falls back to opening the Input Monitoring pane. Recording a custom key needs an installed active tap, has a 10-second deadline, consumes the recorded key through release (including repeats), and bypasses session detection meanwhile.

**Sessions.** `capture_guard.rs` turns input edges into sessions:

| Session | Starts on | Ends on |
|---|---|---|
| `⌘⇧4`-style selection (incl. `⌃` variant and custom picker keys — WeChat `⌘⌃A`, Snipaste `Fn+F1` via `set_capture_hotkeys`) | shortcut key-down | mouse release, Esc, Enter (Space only switches to window picking) |
| `⌘⇧5` toolbar | shortcut key-down (re-press restarts) | a newly saved capture file — screenshots and finished recordings alike (clipboard saves still need Esc) |
| Any session | — | Esc (also mid-recording: use tray Hide for guaranteed-clean recordings), `⌘⌃Esc`, 30-minute bound |

Every session end flows through a 400 ms exit grace before overlays return. While suppressed (preference off), overlays hide natively and frontend rAF/audio plus cursor work pause; the poller only replays timeout/grace bookkeeping plus a save-directory scan for toolbar completion (twice per second, expedited after toolbar clicks; file names and mtimes only — no content, no window-list queries). Opt-in bypasses suppression. macOS content protection stays off, so a selected overlay never becomes uncapturable in `⌘⇧4` → Space.

**Settings sync.** Primary overlay and settings apply `setOverlayCaptureVisible` before load resolves; secondaries load with `loadSettings(false)` so stale store data can't overwrite a newer native choice. Saves await the native update before persisting and broadcasting `settings-changed`; a native failure rejects the save, restores the previous preference, and shows a failure state. A first-load native failure only logs.

**Limits.** Best effort only: instant `⌘⇧3` captures (taken on key-down), recordings outlasting the session bound, and unconfigured third-party tools are not covered. Windows uses native `WDA_EXCLUDEFROMCAPTURE` instead of input detection. When exclusion is required, use tray Hide.

## 10. Feeding & post-meal state

```text
selectBait(bug, baits)          // distance × foodInterest (favoriteFood × personality.appetite)
        │
        ▼ in BAIT_NIBBLE_RADIUS
resolveEatPlan(personality, species.eatStyle)
        │  hold / cooldown / cling / carry / bob / ripple / probe
        ▼
nibble (paused, eatingBaitId, enjoyingFood if favorite)
        │
        ├─ cling  → keep topping the timer while still in range
        └─ peck   → foodCooldown, then leave; carry styles set carryKind
```

| Field | Meaning |
|-------|---------|
| `eatingBaitId` | Currently on a snack; cleared every frame unless still in range |
| `enjoyingFood` | Species favorite — draws the heart while paused |
| `foodCooldown` | Skittish/pecking styles wait before the next bite (shy long, curious short) |
| `satisfiedTimer` | Post-meal warm glow; `SATISFIED_FAVORITE_SEC` (8s) vs `SATISFIED_ANY_SEC` (2.5s) |
| `carryKind` / `carryTimer` | Ant haul after a peck; walks to the nearest edge for `CARRY_DURATION_SEC` (6s), mouth crumb drawn in the renderer |

Nibble FX (cookie crumbs / sugar sparks / fruit drips) spawn from BugManager on a short cooldown while `eatingBaitId` is set. A finished fruit leaves a `__juice` stain. Hover/ripple species only change the draw (bob / body scale pulse); carry/scurry/sip change timing and may leave the snack.

Personality base timing lives in `EAT_STYLES` (`personality.ts`); species flavor is applied in `resolveEatPlan` (`feeding.ts`). New species only need an optional `eatStyle` trait.

## 11. Spray & random events

```text
Tray “Insecticide spray”
  └─ prank_spray → broadcast to overlays → sprayKillAll + mist FX + hiss
       Primary: set_tray_spray(remaining sec) updates the item in place (no set_menu)

Settings “Random events”
  └─ primary overlay 2s poll of tickAutoEvent
       due → rollRandomEvent → emit("random-event", {kind})
       each screen: title card plays out, then applyRandomEvent(kind)
       pool: swarm / fat_invasion / berserk / size_chaos / night_raid
       primary rearmAfterEvent(banner + busy(kind) + 90–240s gap)
```

- Swarm target: `min(countMax, max(settings.count + 12, settings.count * 2))`; state lives only on the `BugManager` instance.
- User count change / regenerate / clear / tray ± cancels the storm and converges to the configured count.
- Event pool is swarm-only for now; future events extend `fireRandomEvent` without touching the tray.

## 12. Extending species

```ts
// src/species/example.ts
registerSpecies({
  id: "example",
  label: "Example",
  emoji: "✨",
  traits: {
    bodyScale,
    speedMul,
    edgeAffinity,
    tint,
    fluidColor,
    stainColor,
    // optional: favoriteFood, activity ("diurnal" | "nocturnal"),
    // eatStyle ("carry" | "hover" | "ripple" | "scurry" | "wrap" | "probe" | "sip" | "munch")
  },
  draw(ctx, bug, alpha) { /* canvas paths */ },
});
```

Import from `src/species/index.ts`. Movement stays shared; traits only bias behavior. `activity` only affects random mixes; an explicit species pick ignores the day phase. `eatStyle` layers on top of personality timing via `resolveEatPlan`.

## 13. Conventions

- TypeScript `strict`
- Vue components are UI-only; logic in `core/` / `services/`
- No heavy allocation inside the rAF loop
- Constants in `src/core/config.ts`
- Pure core logic is covered by Vitest (`pnpm test`)
