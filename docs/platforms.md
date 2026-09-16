# Platform notes

[中文](platforms.zh-CN.md)

Last macOS soak: **2026-09-11** on Apple M1 Pro · macOS 15.7.9 · built-in Retina 3024×1964@2x + external 1920×1080.

- Dev path: `pnpm tauri dev` (debug + Vite)
- Production path: `pnpm tauri build` → `BugScurry.app` / `BugScurry_0.1.0_aarch64.dmg` (soaked after user build)

Windows column remains unverified on this machine.

## macOS

### Window

- Transparent + borderless: `transparent`, `decorations: false`
- Always on top; `focusable: false` for overlays
- Menu bar tray, not a Dock-primary app
- Fullscreen apps / Stage Manager may cover the overlay (system policy)
- **Spaces:** overlays use `visibleOnAllWorkspaces` so bugs follow desktop switches

### Pass-through

- `setIgnoreCursorEvents` ↔ `NSWindow.ignoresMouseEvents`
- No Electron-style `forward`; poll cursor in Rust and toggle pass-through
- Flipping pass-through can drop a click; keep a short hover grace period

### Retina

- `devicePixelRatio` is 2 on built-in displays
- Canvas backing store must be `css * dpr`
- CGEvent cursor is global **points**; convert with each window’s origin/scale

### Arch

- Apple Silicon and Intel builds (or universal)
- Record minimum OS in `tauri.conf.json` / README

### Runtime notes (verified)

| Topic | Finding |
|-------|---------|
| Dev vs raw `cargo build --release` | `pnpm tauri dev` loads `http://localhost:1420` and needs Vite running. Running `target/debug/bugscurry` **without** Vite leaves a blank WebView. Production assets must be built with `pnpm tauri build`; a bare `cargo build --release` may not embed `frontendDist` correctly. |
| Overlay paint | Production `BugScurry.app`: CGWindow capture of the primary overlay shows non-transparent bug pixels over a mostly transparent frame. |
| Multi-monitor | `monitorMode: "all"` created a second overlay on the 1920×1080 display in both dev and the production app. |
| Settings window | Created hidden (`onscreen=false`); opening settings must not be required for the overlay loop. |
| Settings vs overlay z-order (0.3+) | Opening settings must **not** demote the overlay `always_on_top`. Overlay stays on top so bugs remain visible; settings is shown/focused. Clicks pass through except over bugs. |
| Rain / thunder (0.3+) | Tray weather has five intensities + stop/random with checkmarks. Rain audio is procedural (primary overlay only); hard-mute on stop / hide / sound off. Thunder is a delayed low rumble (close strikes add a dark tear). |
| Feeding FX (0.3+) | Personality + species eat styles; ant carry draws a crumb at the mouth; fruit finish leaves a short `__juice` blot; post-meal warm glow. |
| Bundle | `src-tauri/target/release/bundle/macos/BugScurry.app` · `dmg/BugScurry_0.1.0_aarch64.dmg` (arm64) |

## Windows

### Window

- Transparent topmost via Tauri (layered / topmost / tool window)
- `skipTaskbar: true`
- Requires WebView2 runtime

### Pass-through

- Layered click-through; toggle only on hover change
- Cursor from `cursor_position` is **physical** pixels

### DPI

- Test 100% / 125% / 150% / 200%
- Mixed DPI multi-monitor is a priority case
- Simulation and hit-test stay in logical CSS pixels

### Arch

- x64 primary; ARM64 best-effort (WebView2 + tray)

**Status:** CI builds the NSIS installer. No Windows soak run on this machine yet — treat matrix cells below as pending.

## Multi-monitor

| Issue | Approach |
|-------|----------|
| Different resolutions | One overlay window + viewport per display |
| Different scales | Per-window dpr |
| Hot-plug / primary change | Rebuild overlays |
| “Current screen” | Primary display (documented in UI) |

## Spaces / virtual desktops

macOS: set `visibleOnAllWorkspaces` so the overlay is not stuck on one Space. Soaked 2026-09-11 with **2 Spaces** — overlay stayed `onscreen=true` and kept painting after Ctrl+←/→.

## Performance checklist

### Production (`pnpm tauri build` · BugScurry.app · M1 Pro)

- [x] Idle CPU with 1 bug — **~4.8%** process CPU (primary overlay only)
- [x] 10 bugs, both displays — **~8.2%** process CPU
- [x] 50 bugs, both displays — **~4.9%** short sample (high variance; not CPU-bound)
- [x] Near-zero CPU when hidden — **Pass after poller pause.** Tray hide stops rAF and the Rust cursor poller (`set_cursor_poller_enabled(false)`); measured ~**0.0%** CPU while hidden vs ~5.5% visible (debug, 12 bugs).
- [x] Overlay keeps running while settings is open — settings stays hidden unless opened from tray; overlays independent
- [x] Sleep/wake recovery — **Pass (2026-09-16).** Lid closed >30s; primary/secondary bugs and rain recovered automatically. Path: `system-resumed` → `force_rebuild_overlays` (close+recreate secondaries, same as toggling multi-monitor) → refresh viewport / resume audio.

### Debug (`pnpm tauri dev` · upper bound)

Higher than production (Vite HMR + debug codegen). Earlier samples: ~10–15% (1 bug), ~4–5% (10 bugs), ~3% (50 bugs, short window).

## Manual test matrix

| Case | macOS | Windows |
|------|-------|---------|
| Overlay visible | Pass (dev + production paint / windows onscreen) | Pending |
| Clicks pass through desktop icons | Pass — empty-overlay click + keystrokes landed in TextEdit document | Pending |
| Click bug → squish | Pass — CGEvent click after ~250 ms hover dwell; ladybug clusters 12→11, fluid stain pixels appeared | Pending |
| No auto-respawn after kill | Pass (unit tests + code review) | Pending |
| Tray menu | Pass (CGEvent opened status menu; hide/show toggled; settings opens from tray) | Pending |
| Close settings keeps app | Pass (close button hides window; process stays) | Pending |
| Retina / DPI OK | Pass (CSS×dpr; overlay 1512×982 @2x; prod paint verified) | Pending |
| External display | Pass (`monitorMode: all` second overlay, prod + dev) | Pending |
| Switch Spaces (macOS) | Pass — 2 Spaces; overlay remained onscreen with bug pixels after switch | — |
| Hide bugs (tray) | Pass (toggle works; hidden CPU ~0% after poller pause) | Pending |

## How to re-run the macOS soak

```bash
pnpm install
pnpm tauri dev          # requires Vite on :1420 — do not run the debug binary alone
```

For a production-shaped binary use `pnpm tauri build`, then launch the bundled app. Do not treat `cargo build --release` alone as a release artifact.

### Sleep/wake soak (manual)

1. Run `pnpm tauri dev` or the production bundle; confirm bugs crawl on the desktop.
2. Optional: drop bait / start rain from the tray so audio recovery is observable.
3. Sleep the machine for at least 30 seconds (Apple menu → Sleep, or close the lid).
4. After wake, check:
   - Bugs crawl inside **both primary and secondary** displays (not off-screen, frozen, or a missing secondary layer)
   - If rain was on, streaks return on both displays; ambience returns within a few seconds
   - Clicking a bug still squishes (pass-through + hit test OK)
   - Open then close settings — the app stays running
5. Also test Clear all: it should clear bugs/snacks/stains **and stop rain**; Regenerate then brings bugs back without restarting rain.
