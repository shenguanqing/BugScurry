# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.1.0] - 2026-09-12

First public baseline: desktop bug overlay for macOS and Windows.

### Added

- Transparent, borderless, always-on-top overlay with mouse pass-through; only bugs are clickable
- Species registry: cockroach, ant, spider, fly, ladybug (and random mix)
- Settings window: count 1–50, size, speed, randomness, sound / stains / particles, species, theme, locale, autostart, multi-monitor
- Tray / menu bar: show-hide, add/remove, regenerate, settings, quit
- Squish FX: flatten animation, optional Web Audio snap, stains, particles
- Multi-monitor: current screen / all screens; per-window hit-test coords
- i18n (zh-CN / en) for settings, tray labels, and docs
- Vitest unit tests for core pure logic (`pnpm test`)
- CI: frontend typecheck + tests, `cargo check`, Windows NSIS build, macOS DMG build
- Pause rAF + cursor poller while bugs are hidden (~0% idle CPU)

### Notes

- Squished bugs are **not** auto-replaced
- Closing the settings window does not quit the app
- Production binaries must be built with `pnpm tauri build` (not bare `cargo build --release`)

[Unreleased]: https://github.com/shenguanqing/BugScurry/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/shenguanqing/BugScurry/releases/tag/v0.1.0
