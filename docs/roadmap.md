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
- [x] No auto-respawn after squish

## M2 — Many bugs + settings

- [x] Settings window (count, size, speed, randomness)
- [x] Clear / regenerate / live sync
- [x] Store persistence
- [x] Closing settings does not quit
- [x] Species picker (random / cockroach / ant / spider / fly / ladybug)

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
- [x] Species registry (cockroach, ant, spider, fly, ladybug)
- [x] Platform matrix notes
- [x] Unit tests for core pure logic (`pnpm test`)
- [x] CI: typecheck + tests + cargo check + Windows NSIS + macOS DMG
- [x] Tag-triggered GitHub Release (`v*`) + CHANGELOG
- [ ] Version bump / release pipeline dry-run beyond 0.1.0

## Later (not blocking)

- [x] Overlay on all macOS Spaces (soaked 2 Spaces on macOS 15.7.9; overlay stayed onscreen)
- [x] Pause rAF + cursor poller while bugs hidden (~0% CPU when hidden)
- [ ] Sleep/wake recovery soak
- [ ] Full Windows soak test
- [ ] macOS signing / notarization pipeline
- [ ] Species visual polish beyond current silhouettes

## Definition of done

1. `pnpm typecheck` passes
2. `pnpm test` passes
3. `pnpm build` passes
4. `cargo check` passes
5. Overlay + settings verified on macOS
6. Docs match the code
