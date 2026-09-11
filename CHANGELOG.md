# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

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

[Unreleased]: https://github.com/shenguanqing/BugScurry/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/shenguanqing/BugScurry/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shenguanqing/BugScurry/releases/tag/v0.1.0
