# Platform notes

[中文](platforms.zh-CN.md)

Last macOS soak: **2026-09-16** (including lid-close sleep/wake) on Apple M1 Pro · macOS 15.7.9 · built-in Retina 3024×1964@2x + external 1920×1080. Spaces soak separately on 2026-09-11.

- Dev path: `pnpm tauri dev` (debug + Vite)
- Production path: `pnpm tauri build` → `BugScurry.app` / `BugScurry_0.4.0_aarch64.dmg` (soaked after user build)

Windows column remains unverified on this machine.

## macOS

### Window

- Transparent + borderless: `transparent`, `decorations: false`
- Always on top; `focusable: false` for overlays
- Menu bar tray, not a Dock-primary app
- Fullscreen apps / Stage Manager may cover the overlay (system policy)
- **Spaces:** overlays use `visibleOnAllWorkspaces` so bugs follow desktop switches
- Tray hide calls native `hide()` on every overlay, so the transparent window is absent from macOS window capture; Show restores the overlays without taking focus.
- Capture preference: with `showInCaptures: false` (default), screenshot sessions temporarily hide all native overlays (tray Hide still wins); they restore ~400 ms after the session ends. Detection only matches the screenshot shortcuts, passes events through, stores nothing, and needs Input Monitoring or Accessibility — the settings window guides granting. Content protection stays off so window capture can't break on a selected overlay. Internals: [architecture §9.3](../architecture.md#93-capture-preference).
- Sessions at a glance: `⌘⇧4`-style selections end on mouse release / Esc / Enter; `⌘⇧5` ends when its capture file is saved (clipboard saves need Esc); Esc or `⌘⌃Esc` ends anything, including mid-recording. Not covered: instant `⌘⇧3`, over-long recordings, unconfigured third-party tools. No public API prevents ScreenCaptureKit capture (Apple DTS, macOS 15.4+). [Apple response](https://developer.apple.com/forums/thread/792152).

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
| Bundle | `src-tauri/target/release/bundle/macos/BugScurry.app` · `dmg/BugScurry_0.4.0_aarch64.dmg` (arm64) |

## Windows

### Window

- Transparent topmost via Tauri (layered / topmost / tool window)
- `skipTaskbar: true`
- Requires WebView2 runtime
- Tray hide/show changes every overlay's native visibility, using the same shared state as macOS.
- Capture preference requests `WDA_EXCLUDEFROMCAPTURE` when `showInCaptures` is off; supported from Windows 10 version 2004, with `WDA_MONITOR` behavior on older versions. It applies to supported OS capture methods and depends on desktop composition; coverage of actual capture tools remains unverified. [Microsoft API documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).

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
| Hot-plug / primary change | Rebuild overlays while preserving shared native visibility |
| “Current screen” | Primary display (documented in UI) |

## Spaces / virtual desktops

macOS: set `visibleOnAllWorkspaces` so the overlay is not stuck on one Space. Soaked 2026-09-11 with **2 Spaces** — overlay stayed `onscreen=true` and kept painting after Ctrl+←/→.

## Performance checklist

### Production (`pnpm tauri build` · BugScurry.app · M1 Pro)

- [x] Idle CPU with 1 bug — **2026-10-06 re-measure (release, macOS 15.8.1, arm64): ~15.6%** total — host ~7.7% + overlay WebView ~7.9% (10s `top` samples, primary ProMotion display, firefly, quiet settings). Up from the historical **~4.8%**: 0.4.x species/weather polish roughly doubled per-frame work. Stain sprites + glow sprites (this change) keep gradients out of the frame loop.
- [x] 10 bugs — **~10.4%** total (host ~4.4% + web ~6.0%), same conditions
- [x] 50 bugs — **~6.3%** total (host ~2.8% + web ~3.5%), same conditions
- [ ] Idle cost scales **inversely** with bug count (reproducible): lighter frames hold a higher rAF cadence on the ProMotion panel (likely 120Hz vs 60Hz), so idle 1-bug costs more than idle 50. If confirmed, capping the render loop (e.g. 60fps) is a cheap future win; not yet verified with frame instrumentation.
- [x] Near-zero CPU when hidden — **Historical measurement:** ~**0.0%** CPU while hidden vs ~5.5% visible (debug, 12 bugs). The current implementation stops frontend rAF/audio from the shared visibility event, and the Rust poller skips cursor work from the native visibility flag; the hidden path did not change in 0.4.x, re-measure needs tray-menu automation.
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
| Hide bugs (tray) | Previous render/poller toggle passed; native hide/show change pending | Pending |
| Hidden overlays absent from window capture | Pending | Pending |
| Monitor rebuild / wake preserves hidden state | Pending | Pending |
| Capture preference off: system window picker hides overlays and captures application | Pending | — |
| Capture UI exit / cancel restores overlays, preserves manual Hide | Pending | — |
| Capture opt-in and screenshot / recording tool coverage | Pending (immediate full-screen / ongoing recording not guaranteed) | Pending |

## How to re-run the macOS soak

```bash
pnpm install
pnpm tauri dev          # requires Vite on :1420 — do not run the debug binary alone
```

For a production-shaped binary use `pnpm tauri build`, then launch the bundled app. Do not treat `cargo build --release` alone as a release artifact.

### Native hide / window capture acceptance (manual; pending)

1. Start the app with monitor mode **All screens**; confirm bugs appear on each display.
2. Choose tray **Hide bugs**. On macOS, press `⌘⇧4`, then Space, and select an application window on each display. The selected window and captured image must belong to that application, with no BugScurry layer. On Windows, perform the equivalent window capture with Snipping Tool; desktop interaction must also remain normal.
3. While hidden, open/close settings and switch monitor mode between primary/all. Repeat window capture; no overlay should reappear or intercept capture.
4. While hidden, sleep for at least 30 seconds and wake; repeat window capture on every display. Monitor hot-plug while hidden should also preserve this state.
5. Choose **Show bugs**. All applicable overlays must resume movement, audio (if enabled), and click-to-squish without taking keyboard focus. Repeat hide/show to check both transitions.

### Capture preference acceptance (manual; pending)

1. With bugs visible, leave `showInCaptures` off (the default). With neither Input Monitoring nor Accessibility granted, the settings window must show the screenshot-compatibility hint. Click Enable: request authorization, then open Input Monitoring settings if it remains denied. Grant Input Monitoring alone and confirm screenshot detection works while recording remains disabled; separately grant Accessibility alone and confirm both screenshot detection and shortcut recording become available without additionally granting Input Monitoring. On macOS, press `⌘⇧4`, then Space. All overlay windows must hide, an underlying application must be selectable, and saving its window capture must succeed. Repeat with a region capture and `⌘⇧5` on every display. On Windows, check supported capture tools' exclusion with bugs still visible on the desktop.
2. Complete or cancel macOS capture (selection: mouse release, Esc, Enter; toolbar: Esc after capture, or `⌘⌃Esc` to stop recording). Overlays must resume after the session ends without taking focus. Choose tray Hide before or during capture and repeat; exit must not unhide them. Change monitor mode during capture and check that rebuilt overlays stay suppressed.
3. Turn the preference on. macOS should leave overlay windows visible during Screenshot UI; supported captures can include overlay content. The settings window must remain capturable with either value.
4. After replacing the app with a new build, confirm the permission status belongs to the current installed app. If authorization is reported but the listener remains unavailable, the settings window must show a retry/restart hint instead of an unexplained disabled recording button.
5. Turn the preference off while bugs are hidden, then show them again. Restart and change monitor mode; verify that the persisted preference is applied to every rebuilt overlay. Record immediate `⌘⇧3`, ongoing system recording, and third-party tool behavior separately; macOS exclusion is not guaranteed for these cases. Use tray Hide for recordings that must exclude bugs.

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
