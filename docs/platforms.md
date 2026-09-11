# Platform notes

[中文](platforms.zh-CN.md)

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

## Multi-monitor

| Issue | Approach |
|-------|----------|
| Different resolutions | One overlay window + viewport per display |
| Different scales | Per-window dpr |
| Hot-plug / primary change | Rebuild overlays |
| “Current screen” | Primary display (documented in UI) |

## Spaces / virtual desktops

macOS: set `visibleOnAllWorkspaces` so the overlay is not stuck on one Space.

## Performance checklist

- [ ] Idle CPU with 1 bug
- [ ] 60 FPS with 10 bugs
- [ ] 60 FPS with 50 bugs (FX may reduce)
- [ ] Near-zero CPU when hidden
- [ ] Overlay keeps running while settings is open
- [ ] Sleep/wake recovery

## Manual test matrix

| Case | macOS | Windows |
|------|-------|---------|
| Overlay visible | | |
| Clicks pass through desktop icons | | |
| Click bug → squish | | |
| No auto-respawn after kill | | |
| Tray menu | | |
| Close settings keeps app | | |
| Retina / DPI OK | | |
| External display | | |
| Switch Spaces (macOS) | | |
