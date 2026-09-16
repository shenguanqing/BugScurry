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
  └── menu → tray-command events → overlay
```

## 3. Module responsibilities

| Module | Path | Responsibility |
|--------|------|----------------|
| Bug | `src/core/bug.ts` | Entity factory (position, heading, size, species, state, carry) |
| BugManager | `src/core/bugManager.ts` | List, count edits, clear, regenerate, squish FX, nibble FX, juice blots; **no auto-replace after death** |
| Settings clamp | `src/core/settings.ts` | Pure settings normalization (no Tauri imports) |
| Personality / Feeding | `src/core/personality.ts`, `src/core/feeding.ts` | Spawn-time personality; `resolveEatPlan` stacks species `eatStyle` on personality; food selection by distance + `favoriteFood` |
| Weather | `src/core/weather.ts` | Local-clock `DayPhase` weights; rain kind profiles, wind, lightning envelope, auto-rain clock |
| Rain audio / textures | `src/core/rainAudio.ts`, `src/core/rainTexture.ts` | Procedural rain bed + thunder; offline-built loop textures (no per-drop synthesis in rAF) |
| Movement | `src/core/movement.ts` | Crawl / pause / turn / corner escape / edge-hug / rain cover / nibble & carry haul |
| Renderer | `src/core/renderer.ts` | Canvas draw, squish transform, stains, particles, rain streaks, lightning, carried crumbs; delegates species `draw` |
| HitTest | `src/core/hitTest.ts` | Pointer vs bug radius |
| Squish | `src/core/squish.ts` | `squishing` → `dying` progress |
| Audio | `src/core/audio.ts` | Short Web Audio “snap” / hurt |
| Loop | `src/core/loop.ts` | rAF update + render; primary `onFrame` drives rain audio |
| Species | `src/species/*` | Registry, traits (`favoriteFood`, `activity`, `eatStyle`), per-species drawing |
| Settings UI | `src/settings/*` | Settings window |
| Services | `src/services/*` | Tauri events/commands, store, theme, monitors |
| DailyStatsService | `src/services/dailyStatsService.ts` | Primary-overlay owner: queue kills, serialize store writes, refresh tray stats |
| Shell | `src-tauri/src/lib.rs` | Windows, cursor, monitors, commands, overlay/settings z-order |
| Tray | `src-tauri/src/tray.rs` | Menu bar / tray menu (feed + weather submenus) |

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
Rust poller → cursor-local {x,y,inside} per overlay
                     │
frontend hit test ───┤
                     ├─ hit  → setIgnoreCursorEvents(false) → click → squish
                     └─ miss → setIgnoreCursorEvents(true)
```

Only flip pass-through when hover state changes. Overlay windows are `focusable: false`.

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

## 11. Extending species

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

## 12. Conventions

- TypeScript `strict`
- Vue components are UI-only; logic in `core/` / `services/`
- No heavy allocation inside the rAF loop
- Constants in `src/core/config.ts`
- Pure core logic is covered by Vitest (`pnpm test`)
