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
| Bug | `src/core/bug.ts` | Entity factory (position, heading, size, species, state) |
| BugManager | `src/core/bugManager.ts` | List, count edits, clear, regenerate, squish FX spawn; **no auto-replace after death** |
| Settings clamp | `src/core/settings.ts` | Pure settings normalization (no Tauri imports) |
| Movement | `src/core/movement.ts` | Crawl / pause / turn / corner escape / edge-hug |
| Renderer | `src/core/renderer.ts` | Canvas draw, squish transform, stains, particles; delegates species `draw` |
| HitTest | `src/core/hitTest.ts` | Pointer vs bug radius |
| Squish | `src/core/squish.ts` | `squishing` → `dying` progress |
| Audio | `src/core/audio.ts` | Short Web Audio “snap” |
| Loop | `src/core/loop.ts` | rAF update + render |
| Species | `src/species/*` | Registry, traits, per-species drawing |
| Settings UI | `src/settings/*` | Settings window |
| Services | `src/services/*` | Tauri events/commands, store, theme, monitors |
| Shell | `src-tauri/src/lib.rs` | Windows, cursor, monitors, commands |
| Tray | `src-tauri/src/tray.rs` | Menu bar / tray menu |

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

## 8. Extending species

```ts
// src/species/example.ts
registerSpecies({
  id: "example",
  label: "Example",
  emoji: "✨",
  traits: { bodyScale, speedMul, edgeAffinity, tint, fluidColor, stainColor },
  draw(ctx, bug, alpha) { /* canvas paths */ },
});
```

Import from `src/species/index.ts`. Movement stays shared; traits only bias behavior.

## 9. Conventions

- TypeScript `strict`
- Vue components are UI-only; logic in `core/` / `services/`
- No heavy allocation inside the rAF loop
- Constants in `src/core/config.ts`
- Pure core logic is covered by Vitest (`pnpm test`)
