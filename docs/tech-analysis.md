# Tech analysis: Tauri 2 vs Electron

[中文](tech-analysis.zh-CN.md)

> Goal: pick the stack best suited to **transparent desktop overlay + selective clicks + always-on background**.

## 1. Constraints

| Constraint | Notes |
|------------|-------|
| Transparent borderless topmost overlay | macOS + Windows |
| Mouse pass-through by default | Don’t block the desktop |
| Only bugs clickable | Squish on hit |
| Background resident | Low resources |
| Up to 50 bugs @ ~60 FPS | Canvas |
| Multi-monitor / Retina / DPI | Correct logical vs physical coords |
| Tray / menu bar | Settings window must not quit the app |

The deciding capability is **pass-through + selective click**.

## 2. Comparison (summary)

| Dimension | Tauri 2 | Electron |
|-----------|---------|----------|
| WebView | System WKWebView / WebView2 | Bundled Chromium |
| Memory | ~30–80 MB | ~150–300 MB |
| Installer size | ~5–10 MB | ~80–150 MB |
| Selective click | Custom cursor poll + toggle pass-through | `setIgnoreMouseEvents(true, { forward: true })` |
| Multi-monitor APIs | Compose from native | `screen` module |
| Tray | Native, small | Native |
| Consistency | System WebView variance | Full Chromium |

### Selective click

**Electron:** `forward: true` keeps `mousemove` while clicks pass through — mature pattern for desktop pets.

**Tauri:** no forward mode. When ignoring cursor events the WebView gets nothing. Fix: poll global cursor in Rust, emit per-window local coords, toggle `ignore_cursor_events` on hover.

## 3. Decision: Tauri 2 + Vue 3 + TypeScript

Reasons:

1. Always-on desktop pet — memory and binary size matter to users
2. Canvas load is modest; system WebView is enough
3. Selective click is solvable with a small Rust poller (already in `lib.rs`)
4. Tray, transparent topmost, multi-monitor supported
5. Frontend stays portable if Electron fallback is ever required

### Costs & mitigations

| Cost | Mitigation |
|------|------------|
| No `forward: true` | Rust poller + hover toggle |
| WebView differences | Test matrix on real OS builds |
| Mixed DPI monitors | CGDisplayBounds on macOS; physical math on Windows |

### Fallback trigger

Evaluate Electron if pass-through misses clicks at scale, mixed-DPI coords cannot converge, or system WebView cannot hold 60 FPS.

## 4. Final stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2 |
| Frontend | Vue 3 + TypeScript + Vite |
| Package manager | pnpm |
| Render | Canvas 2D |
| Persistence | tauri-plugin-store |
| Autostart | tauri-plugin-autostart |
| Bundle | Tauri (DMG / NSIS) |

## 5. Why not Electron (short)

Not “Electron can’t” — Tauri is a better default for a 24/7 lightweight overlay, with a clear native path for clicks, and a decoupled frontend if we ever need to switch.
