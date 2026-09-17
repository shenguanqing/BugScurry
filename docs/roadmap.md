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
- [x] Species picker (random / cockroach / ant / spider / fly / ladybug / bee / caterpillar / butterfly / mosquito)

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
- [x] Species registry (cockroach, ant, spider, fly, ladybug, bee, caterpillar, butterfly, mosquito)
- [x] Platform matrix notes
- [x] Unit tests for core pure logic (`pnpm test`)
- [x] CI: typecheck + tests + cargo check + Windows NSIS + macOS DMG
- [x] Tag-triggered GitHub Release (`v*`) + CHANGELOG
- [x] Release pipeline dry-run at v0.1.1

## M6 — Interaction & light gamification (post v0.1.1)

- [x] Extra species: bee, caterpillar, butterfly, mosquito (9 total + random)
- [x] Flee from cursor (repellent); panic bolt when almost on top
- [x] Chase hit radius while the cursor is close
- [x] Four persistent personalities; cookie/sugar/fruit preferences, three snacks, favorite-food hearts
- [x] Personality + species eating styles (ant carry, bee hover, …); nibble crumbs / juice blots / post-meal glow
- [x] Cookie bait from the tray; bugs gather to nibble
- [x] Local-clock phase mix (diurnal vs nocturnal) and tray weather (five rain kinds, wind, lightning, rain audio)
- [x] Combo: 2s chain floats + rising pitch; tray “Today” stats
- [x] Fat bug: ~6% chance, 2–3× size, 3 HP, burst on kill
- [x] i18n: zh-CN, zh-TW, en, ja, ko
- [x] Settings UI toward iOS inset-grouped (borderless cards, list rows, selects)

## M7 — Spray, random events & weather expansion

- [x] Tray “Insecticide spray”: screen-wide kill + mist FX + hiss; 45s countdown in the label; counts toward daily stats
- [x] Settings “Random events”: equal-weight pool (bug tide / fat invasion / berserk dash / size chaos / night raid); never rewrites `count`
- [x] Bug tide: temporary double (cap 50), 18s peak then 12s fall
- [x] Full-viewport title card (plays out and fades before the event); multi-display sync
- [x] Spray cooldown via in-place `set_text`; tray “Random shower” removed
- [x] Settings info-icon popovers; random-events / random-weather tips list the pools
- [x] Hidden debug panel (footer ×5): every weather kind + events + spray
- [x] Weather: snow / fog / sandstorm; tray “Weather”, Settings “Random weather”, stop label
- [x] `atmosphere.ts` seamless fog/dust textures and sand gust (shared audio/visual envelope)
- [x] First-class QA page: `qa/` (Vite maps legacy `.tmp-species-qa` bookmarks)
- [x] Unit tests: `prank` / `randomEvents` / `atmosphere` / weather families

## Later (not blocking)

- [x] Overlay on all macOS Spaces (soaked 2 Spaces on macOS 15.7.9; overlay stayed onscreen)
- [x] Pause rAF + cursor poller while bugs hidden (~0% CPU when hidden)
- [x] Sleep/wake recovery code path (cursor poller gap ≥2s → `system-resumed`: force-rebuild secondary overlays, refresh viewport, resume audio; first-frame dt clamped by `MAX_DT`)
- [x] Sleep/wake recovery on-device soak (2026-09-16, lid closed >30s: primary/secondary bugs and rain recovered without toggling multi-monitor)
- [ ] Full Windows soak test
- [ ] macOS signing / notarization pipeline
- [x] Species visual polish (contact shadow, shell glints; cockroach pronotum spots, ladybug elytra gloss, spider abdomen chevrons, butterfly eyespots, mosquito bands, bee wing cross-veins, etc.)

## Definition of done

1. `pnpm typecheck` passes
2. `pnpm test` passes
3. `pnpm build` passes
4. `cargo check` passes
5. Overlay + settings verified on macOS
6. Docs match the code
