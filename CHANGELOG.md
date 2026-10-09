# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.2] - 2026-10-09

Web-demo wallpaper picker fixes and clearer custom wallpaper labeling.

### Changed

- Rename the uploaded wallpaper section to "Custom wallpapers" in all five locales and keep its heading visible when the library is empty

### Fixed

- The Wallpaper tab now opens without a previously uploaded or selected wallpaper; browsing the library no longer saves an empty image selection that immediately falls back to solid color
- Deleting custom wallpapers preserves the selected built-in wallpaper and the Wallpaper tab, including after reload
- Uploading a new custom wallpaper clears the previous built-in selection so the uploaded image becomes active immediately

## [0.6.1] - 2026-10-09

### Added

- Built-in wallpaper library for the web-demo backdrop: official Windows 11 Bloom (light/dark), Windows 10 Hero, and macOS Tahoe / Sequoia / Sonoma / Ventura / Big Sur defaults — hotlinked at 4K–6K, grouped by platform and version with lazy thumbnails
- Joke screens: 4K BSOD photo, CSS-composed Windows updating screen, and Apple's official boot art for macOS (frame shaved, vendored as 2.7KB `public/mac-boot.png`; contain on wide screens, cover on narrow)
- Catalog selections persist as tiny ids and survive reloads; uploads keep working alongside

## [0.6.0] - 2026-10-09

Web demo shell: the same `dist/` now runs as a standalone page (Cloudflare Pages) with near-full feature parity.

### Added

- Page-embedded toolbar replacing the tray (settings / hide / add-remove / regenerate / spray with live cooldown / feed / weather / backdrop picker / today-kills chip) and settings as a code-split right drawer
- Fake-desktop backdrop: checkerboard, solid colors with swatches + custom picker, and an uploadable multi-wallpaper library with thumbnails (persisted on a best-effort quota budget; oversized uploads stay session-only)
- Touch support: larger tap hit radius, no-hover cursor handling, mobile viewport with safe-area-aware toolbar
- `src/platform/desktop.ts` runtime boundary: every native call degrades to a no-op off Tauri; settings/stats persist to `localStorage` on web while desktop keeps `settings.json`
- Share links (`?count=&species=&weather=`): validated/clamped overrides, ephemeral by design
- Installable PWA (`manifest.webmanifest` + icons, standalone display, iOS web-app meta); no service worker — first load needs network

### Fixed

- Web Audio no longer constructs an `AudioContext` before the first user gesture (removes the "AudioContext was not allowed to start" warning); rain ambience fades in after first interaction
- Mobile double-tap zoom disabled (`touch-action`); browser theme-color follows the backdrop; settings drawer no longer hijacks the page tab title; favicon served from `public/`

## [0.5.0] - 2026-10-07

Screenshot compatibility: overlays stay out of screenshots and recordings unless explicitly allowed.

### Added

- Settings “Show in screenshots / recordings” (default off). On macOS a `CGEventTap` detects screenshot sessions — passive with Input Monitoring alone, active with Accessibility alone — and temporarily hides every overlay; it only matches the screenshot shortcuts, passes events through, and stores nothing. On Windows the overlay requests `WDA_EXCLUDEFROMCAPTURE`
- Third-party picker shortcuts (WeChat `⌘⌃A`, Snipaste `Fn+F1` presets, editable in settings); recording a shortcut needs Accessibility, swallows the combo for a few seconds, then discards it
- `⌘⇧5` toolbar sessions end automatically once the capture file is saved (the save-directory scan reads file names and mtimes only); clipboard saves still restore with Esc, and tray Show recovers a stuck session
- Permission UX: explicit opt-in, a recheck delay so the one-time system alert isn't covered by our own Settings pane, manual-add steps, and stale-entry-after-update guidance

### Changed

- Screenshot copy follows one-permission-per-section: Input Monitoring for hiding, Accessibility for recording
- The “open Input Monitoring settings” row hides while the compatibility status row is shown
- The compatibility action in long hints starts on its own line

## [0.4.1] - 2026-10-01

Three new species (firefly, earthworm, beetle) and a visually grouped species picker.

### Added

- New species — firefly: nocturnal, sugar-lover with a breathing lantern glow on its tail; joins the night raid pool
- New species — earthworm: slow diurnal crawler with a peristalsis wave (thick and thin segments travel down the body); fruit-lover
- New species — beetle: green-gold diurnal crawler modeled on the Apple 🪲 emoji; cookie-lover
- Species roster is now 12 + random; i18n names added for zh-CN / zh-TW / en / ja / ko

### Changed

- Settings species picker is ordered by visual family (flyers → hard shells → crawlers → soft bodies) instead of pinyin sort; unknown species append at the end
- Random-weather and random-events info tips end with a lead-in line for their pool lists in every locale

## [0.4.0] - 2026-09-17

Spray tool, random events with title cards, snow/fog/sandstorm weather, settings info popovers, and a hidden debug panel.

### Added

- Tray → Insecticide spray: screen-wide kill + mist FX + hiss, 45s cooldown with a live countdown in the menu label
- Tray weather: snow, fog, and sandstorm beside the five rain intensities (snow drifts, fog uses cached seamless turbulence, sand is warm grit with a wind bed)
- Atmosphere layer: `atmosphere.ts` shares a gust envelope between sand visuals and audio
- Formal QA page under `qa/` (legacy `.tmp-species-qa` URL still maps in Vite dev)
- Settings → Random events: while enabled, auto-rolls chaos every ~90–240s (plus the event window); never rewrites the saved bug count
- Event pool: Bug tide (temporary double count, cap 50), fat invasion (5–7 chonky invaders), berserk dash (×1.8 for 10s), size chaos (0.7–1.6× for 12s), night raid (nocturnal-only pests)
- Full-viewport title card before each auto event (pointer-events: none); card plays out and fades before the event starts; every display banners and reacts together
- Spray broadcasts to every display overlay; cooldown text updates in place so an open tray menu does not flash closed
- Settings toggle rows use ⓘ info popovers (teleported, fixed, list-capable); random-events and random-weather tips list their pools
- Hidden debug panel: click the footer note 5× to force each weather kind / stop, fire each event, or spray

### Changed

- Tray weather no longer offers a one-shot “Random shower”; random kind is only via Settings → Random weather
- Tray stop label is “Stop” (was awkward mixed-language wording)
- Settings toggles reordered: repellent → sound/stains/particles → random weather/events → autostart
- Tray order: stats → show/hide → count controls → spray → feed → weather → settings/quit

### Fixed

- Side-view species previews (ant/bee/caterpillar/mosquito) were mirrored versus the QA page orientation
- Event title cards on secondary displays kept the default Chinese locale after a language change

## [0.3.2] - 2026-09-16

Sleep/wake recovery for multi-monitor, scene-wide clear, species visual polish, and settings hover previews.

### Added

- Sleep/wake recovery: cursor poller detects a ≥2s stall, re-asserts overlay z-order, force-rebuilds secondary overlays (same path as toggling multi-monitor), refreshes viewport, and resumes audio
- Settings → species picker: hovering or keyboard-focusing a tile opens a square popover with a live `drawBug` gait preview (respects reduced motion)
- Shared `contactShadow` under every bug and shell specular glints so silhouettes read on light and dark wallpapers
- Species detail pass: cockroach pronotum spots, ladybug elytra gloss, spider abdomen chevrons, butterfly eyespots, mosquito bands, bee wing cross-veins, fly/ant/caterpillar surface accents

### Changed

- Clear all also stops rain (bugs, snacks, stains, and the shower) — regenerate does not restart rain
- F-SET-11 “Always run” documented as tray residency (no toggle); closing settings never quits
- Settings popover shadow uses a dedicated elevated token (correct on dark theme)

### Fixed

- After lid-close sleep, secondary-display bugs and rain stayed missing until multi-monitor was toggled manually
- Rain ambience could stay suspended after wake when the AudioContext was not torn down

## [0.3.1] - 2026-09-16

Polish after 0.3.0: tray weather checkmarks, stats i18n, README screenshots, select focus fix.

### Added

- Tray → Weather submenu checks the active shower (stop / light / moderate / heavy / downpour / thunderstorm); “random” stays a one-shot action
- README screenshots: desktop overlay + localized tray/settings composites (`docs/screenshots/`)

### Fixed

- Tray “Today” line follows UI language (store kills/combo numbers; format on menu rebuild)
- English tray label: Show / **Hide** bugs
- Settings selects no longer flash a blue focus ring on click (WebKit)

## [0.3.0] - 2026-09-16

Personalities, multi-food feeding, weather with sound, species eating styles, and settings accessibility polish.

### Added

- Four personalities assigned at spawn: shy flees sooner, greedy wakes for snacks, lazy moves slowly and rests longer, curious investigates the cursor from a distance
- Food kinds: cookie, sugar, fruit (tray → Feed bugs); each species has a favorite; eating a favorite shows a heart
- Up to three snacks can coexist; food drops near a live bug; lifetime raised to 20s (faster while nibbled)
- Personality eating styles: shy pecks and bails, greedy/lazy cling, curious takes short pecks; post-meal warm glow (longer on favorites)
- Species eating styles: ants haul crumbs to cover, bees hover, caterpillars ripple, spiders wrap, mosquitoes/flies sip, etc.
- Nibble FX by food: cookie crumbs, sugar sparks, fruit drips; a finished fruit leaves a short juice blot
- Local-clock day phase biases random mixes: diurnal (ant, bee, butterfly, caterpillar, ladybug) by day; nocturnal (cockroach, mosquito, spider) at dusk/night
- Tray → Weather submenu: stop / random / light / moderate / heavy / downpour / thunderstorm; depth-layered streaks, per-shower wind, thunder double-strike lightning; bugs slow and hug edges by intensity
- Procedural rain ambience + delayed thunder rumble (shares the sound toggle); offline-built rain textures; auto rain always rolls a random intensity
- Settings → Random rain: showers start and stop on their own schedule; a manual tray choice re-arms the clock
- Daily stats aggregation service: kills from every display report to the primary overlay, which serializes store writes and tray updates
- Settings: species picker as a radio group, labeled toggles, 44px control targets, slider `aria-valuetext`
- Unit tests for feeding preferences, personality/species eat plans, weather phases, rain motion/audio textures, movement-stream isolation, and daily-stats ownership

### Changed

- Remove the `Ctrl/⌘+B` feeding shortcut; choose food from the tray menu instead
- Each bug keeps its own movement RNG stream (stable when neighbors are reordered or removed)
- Bait attraction now considers every snack, not only the newest crumb

### Fixed

- Windows: register `tauri-plugin-single-instance` so a second launch exits (was stacking two tray icons and two overlays — tray add/remove looked like ±2 bugs)
- Settings: count +/− disabled at limits; toggle rows and selects share one hit height
- Settings window no longer demotes the overlay: bugs stay visible (and clickable except on the panel) while settings is open

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

[Unreleased]: https://github.com/shenguanqing/BugScurry/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/shenguanqing/BugScurry/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/shenguanqing/BugScurry/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/shenguanqing/BugScurry/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/shenguanqing/BugScurry/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shenguanqing/BugScurry/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shenguanqing/BugScurry/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/shenguanqing/BugScurry/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/shenguanqing/BugScurry/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shenguanqing/BugScurry/releases/tag/v0.1.0
