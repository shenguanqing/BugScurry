# Roadmap

[中文](roadmap.zh-CN.md)

Ship a playable loop first; every milestone must be runnable and checkable.

## M0 — Repo & docs

- [x] Git init
- [x] Requirements / architecture / tech analysis
- [x] README, LICENSE, .gitignore
- [x] First commit on `main`

## M1 — MVP: one bug, squishable

- [x] Tauri 2 + Vue 3 project
- [x] Transparent overlay + canvas cockroach
- [x] Random crawl / pause / turn / heading
- [x] Pass-through + click squish
- [x] Basic tray menu

## M2 — Many bugs + settings

- [x] Settings window (count, size, speed, randomness)
- [x] Clear / regenerate / live sync
- [x] Store persistence
- [x] Closing settings does not quit

## M3 — Feel & FX

- [x] Edge-hugging
- [x] Squish polish
- [x] Optional Web Audio
- [x] Optional stains / particles

## M4 — Multi-monitor & system

- [x] Current / all screens
- [x] Autostart
- [x] Lower idle polling when hidden
- [x] Window-local hit testing

## M5 — Packaging & extension points

- [x] README build paths
- [x] Species registry
- [x] Platform matrix notes

## Later (not blocking)

- [ ] Full Windows soak test
- [ ] macOS signing / notarization pipeline
- [ ] Ant / spider / fly / ladybug polish
- [x] No auto-respawn after squish
- [ ] Overlay on all macOS Spaces (implemented; needs soak)

## Definition of done

1. `pnpm typecheck` passes
2. `pnpm build` passes
3. `cargo check` passes
4. Overlay + settings verified on macOS
5. Docs match the code
