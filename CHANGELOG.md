# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.2.0] - 2026-09-15

Interaction, light gamification, more species, and broader i18n.

### Added

- Species: bee, caterpillar, butterfly, mosquito (9 total + random)
- Flee from cursor (repellent): bugs sprint away when the pointer approaches; panic bolt when almost on top
- Chase hit-test: wider hit radius while the cursor is already close, so running bugs stay hittable
- Cookie bait: tray menu / `CmdOrCtrl+B` drops a crumb; nearby bugs gather and nibble
- Combo: kills within 2s chain a floating counter and rising squish pitch
- Fat bug: ~6% chance, 2–3× size, 3 hits to kill, burst particles on the last blow
- Tray “Today” stats line (kills · best combo), persisted per local date
- i18n: zh-TW, ja, ko (alongside zh-CN and en); auto-detect for zh-Hant / ja / ko
- Settings: species picker from the live registry; combo/fat/bait covered by unit tests

### Changed

- Settings UI toward iOS inset-grouped: borderless cards, list rows, native-style selects, system color tokens for light/dark
- Language / theme / display pickers are compact row selects
- Cursor poller kept on the proven per-window `outer_position` path (multi-monitor soak)

### Fixed

- Multi-monitor cursor ownership and hot-plug: orphan overlays close when a display disappears
- Hit radius and flee band so chasing a running bug still connects

### Notes

- Flyswatter cursor was prototyped and removed; empty-space clicks no longer emit a global mouse-down edge

## [0.1.1] - 2026-09-12

Engineering hardening after the first public baseline.

### Added

- Vitest unit tests for core pure logic (`pnpm test`, 39 cases)
- CI (`ci.yml`): typecheck + tests, `cargo check`, Windows NSIS, macOS DMG
- Tag-triggered GitHub Release (`v*`) attaching NSIS + DMG artifacts
- `CHANGELOG.md`
- `docs/README.zh-CN.md` Chinese docs index

### Changed

- Pause rAF + cursor poller while bugs are hidden (~0% idle CPU while hidden)
- Settings window title follows UI language
- macOS soak notes filled in `docs/platforms.md` (pass-through, squish, Spaces, multi-monitor)

### Removed

- Legacy tray-popup window / commands

## [0.1.0] - 2026-09-11

First public baseline: desktop bug overlay for macOS and Windows.

### Added

- Transparent, borderless, always-on-top overlay with mouse pass-through; only bugs are clickable
- Species registry: cockroach, ant, spider, fly, ladybug (and random mix)
- Settings window: count 1–50, size, speed, randomness, sound / stains / particles, species, theme, locale, autostart, multi-monitor
- Tray / menu bar: show-hide, add/remove, regenerate, settings, quit
- Squish FX: flatten animation, optional Web Audio snap, stains, particles
- Multi-monitor: current screen / all screens; per-window hit-test coords
- i18n (zh-CN / en) for settings, tray labels, and docs
- No auto-respawn after squish; closing settings does not quit

### Notes

- Production binaries must be built with `pnpm tauri build` (not bare `cargo build --release`)

[Unreleased]: https://github.com/shenguanqing/BugScurry/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/shenguanqing/BugScurry/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/shenguanqing/BugScurry/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shenguanqing/BugScurry/releases/tag/v0.1.0
