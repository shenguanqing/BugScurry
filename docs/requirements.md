# BugScurry Requirements (PRD)

[中文](requirements.zh-CN.md)

Status: product baseline for MVP+  
Platforms: macOS, Windows  
Form factor: background desktop overlay app

## 1. Product

BugScurry shows small bugs crawling on the user’s desktop. They appear on a transparent, borderless, always-on-top overlay and do not block normal work. The user can click a bug to squish it, with optional sound and leftover marks.

One-liner: **desktop bug pet / joke widget** — light, toggleable, adjustable, extensible species.

## 2. User scenarios

- Add life and humor to the desktop
- Stay in the background without stealing focus or clicks
- Change count, clear screen, open settings, drop bait from tray / menu bar
- Switch species (cockroach, ant, spider, fly, ladybug, bee, caterpillar, butterfly, mosquito; plus random)

## 3. Functional requirements

### 3.1 Overlay window

| ID | Requirement | Priority |
|----|-------------|----------|
| F-WIN-01 | Transparent, borderless, always on top | P0 |
| F-WIN-02 | Not a normal taskbar / Dock window | P0 |
| F-WIN-03 | Cover a display; “current screen” / “all screens” | P0 (MVP may start single-display) |
| F-WIN-04 | Clicks pass through except on bugs | P0 |
| F-WIN-05 | Bug area accepts clicks | P0 |
| F-WIN-06 | No keyboard focus steal | P0 |
| F-WIN-07 | Correct Retina / Windows DPI scaling | P0 |

### 3.2 Lifecycle

| ID | Requirement | Priority |
|----|-------------|----------|
| F-BUG-01 | 1–50 bugs, configurable count | P0 |
| F-BUG-02 | Spawn on edges or inside the screen | P0 |
| F-BUG-03 | Count changes apply immediately | P0 |
| F-BUG-04 | Regenerate clears and respawns from settings | P0 |
| F-BUG-05 | Clear all | P0 |
| F-BUG-06 | **Squished bugs are not auto-replaced.** New bugs only after count increase, tray `+`, or regenerate | P0 |
| F-BUG-07 | Species registry (ship one, extend later) | P1 architecture |

### 3.3 Motion

| ID | Requirement | Priority |
|----|-------------|----------|
| F-MOV-01 | Random heading, slight speed noise | P0 |
| F-MOV-02 | Occasional pause | P0 |
| F-MOV-03 | Occasional direction change | P0 |
| F-MOV-04 | Edge sliding | P1 |
| F-MOV-05 | Never leave the visible area | P0 |
| F-MOV-06 | Independent per-bug RNG | P0 |
| F-MOV-07 | Body rotates with heading | P0 |
| F-MOV-08 | Insect-like motion (noise, leg phase), not a sliding sprite | P0 |
| F-MOV-09 | Stop update/render when hidden | P0 |

### 3.4 Squish

| ID | Requirement | Priority |
|----|-------------|----------|
| F-SQ-01 | Stop moving on click | P0 |
| F-SQ-02 | Short squish animation | P0 |
| F-SQ-03 | Flatten / scale / deform | P0 |
| F-SQ-04 | Optional non-gory stain | P1 |
| F-SQ-05 | Optional short sound | P1 |
| F-SQ-06 | Fade out within ~1–2s | P0 |
| F-SQ-07 | Optional particles | P2 |

### 3.5 Personality, feeding & weather (0.3.x)

| ID | Requirement | Priority |
|----|-------------|----------|
| F-PER-01 | Four personalities at spawn (shy / greedy / lazy / curious) | P0 |
| F-FEED-01 | Tray → Feed bugs: cookie / sugar / fruit; max three snacks | P0 |
| F-FEED-02 | Species favorite food; heart while eating the favorite | P0 |
| F-FEED-03 | Personality + species eating styles (peck, cling, ant carry, …) | P1 |
| F-FEED-04 | Nibble crumbs / sparks / fruit juice blot; post-meal glow | P1 |
| F-WX-01 | Local-clock day phase biases random species mixes | P1 |
| F-WX-02 | Tray weather: stop / random / light / moderate / heavy / downpour / thunderstorm | P0 |
| F-WX-03 | Rain checkmarks in tray; wind re-rolled per shower; thunder flash + audio | P1 |
| F-WX-04 | Settings “Random rain” auto schedule; manual choice re-arms clock | P1 |
| F-WX-05 | Rain sound shares the global sound toggle | P1 |

### 3.6 Settings window

Independent small window. **Closing settings must not quit the app.**

| ID | Requirement | Priority |
|----|-------------|----------|
| F-SET-01 | Count 1–50 | P0 |
| F-SET-02 | + / − | P0 |
| F-SET-03 | Size (live on existing bugs) | P1 |
| F-SET-04 | Speed | P1 |
| F-SET-05 | Randomness | P1 |
| F-SET-06 | Sound on/off | P1 |
| F-SET-07 | Stains on/off | P1 |
| F-SET-08 | Clear all | P0 |
| F-SET-09 | Regenerate | P0 |
| F-SET-10 | Autostart | P1 |
| F-SET-11 | Always run | P1 |
| F-SET-12 | Current screen / all screens | P1 |
| F-SET-13 | Immediate effect + persistence | P0 |

### 3.7 Tray / menu bar

| ID | Requirement | Priority |
|----|-------------|----------|
| F-TRAY-01 | macOS menu bar icon | P0 |
| F-TRAY-02 | Windows system tray icon | P0 |
| F-TRAY-03 | Show / hide bugs | P0 |
| F-TRAY-04 | Add one | P0 |
| F-TRAY-05 | Remove one | P0 |
| F-TRAY-06 | Regenerate | P0 |
| F-TRAY-07 | Settings | P0 |
| F-TRAY-08 | Quit | P0 |
| F-TRAY-09 | Closing settings does not quit | P0 |

## 4. Non-functional

### Performance

| ID | Requirement |
|----|-------------|
| N-PERF-01 | Target 60 FPS |
| N-PERF-02 | Smooth with 50 bugs |
| N-PERF-03 | No per-frame Vue reactive churn |
| N-PERF-04 | Prefer `requestAnimationFrame` |
| N-PERF-05 | Low idle CPU/GPU |
| N-PERF-06 | Skip work when hidden |

### Compatibility

| ID | Requirement |
|----|-------------|
| N-COMP-01 | macOS Apple Silicon + Intel |
| N-COMP-02 | Windows x64 (ARM64 best-effort) |
| N-COMP-03 | Retina correct |
| N-COMP-04 | DPI 100/125/150/200% |
| N-COMP-05 | Mixed-resolution multi-monitor |

### Experience

- Modern, light, slightly humorous
- Not gory or frightening
- Non-blocking by default; strong interactions optional
- Readable on light and dark wallpapers

### Maintainability

- Clear module boundaries (see architecture)
- TypeScript strict
- Logic outside Vue components
- Species via registry, not core-loop forks

## 5. Out of scope (this stage)

- Complex multi-bug social behavior
- Network / accounts / cloud sync
- 3D
- Horror modes
- Mobile

## 6. MVP acceptance

1. Overlay + at least one bug on launch
2. Random crawl, turn, pause
3. Transparent areas pass clicks to the desktop
4. Click squishes and removes the bug in 1–2s
5. Squished bugs are not auto-replaced
6. Settings count applies immediately
7. Tray menu works; quit exits
8. Closing settings leaves the app running
