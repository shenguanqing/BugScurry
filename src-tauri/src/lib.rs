use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    Emitter, Manager, Monitor, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

mod tray;
mod capture_guard;
#[cfg(target_os = "macos")]
mod macos_capture;

const OVERLAY_LABEL: &str = "overlay";

/// The user's tray choice, separate from temporary system-capture suppression.
static OVERLAYS_VISIBLE: AtomicBool = AtomicBool::new(true);

/// Desired capture inclusion for all overlays.
static OVERLAYS_CAPTURE_VISIBLE: AtomicBool = AtomicBool::new(false);
/// A detected system screenshot/recording session (input-event based).
static CAPTURE_SESSION_ACTIVE: AtomicBool = AtomicBool::new(false);
static APPLIED_OVERLAY_VISIBILITY: AtomicBool = AtomicBool::new(true);

/// Bumped whenever overlay geometry or native visibility is (re)applied, so
/// the poller's duplicate-payload suppression cannot pin stale cursor state.
static OVERLAY_LAYOUT_EPOCH: AtomicU64 = AtomicU64::new(0);

fn invalidate_cursor_cache() {
    OVERLAY_LAYOUT_EPOCH.fetch_add(1, Ordering::Relaxed);
}

fn overlays_visible() -> bool {
    capture_guard::effective_visible(
        OVERLAYS_VISIBLE.load(Ordering::Relaxed),
        OVERLAYS_CAPTURE_VISIBLE.load(Ordering::Relaxed),
        CAPTURE_SESSION_ACTIVE.load(Ordering::Relaxed),
    )
}

/// Session edges come from the macOS input tap; the poller only replays
/// timeout/grace bookkeeping. Queueing a sync on every edge would fight a
/// concurrent tray action, so re-read the latest choices on the main thread.
pub(crate) fn set_capture_session_active(app: &tauri::AppHandle, active: bool) {
    if CAPTURE_SESSION_ACTIVE.swap(active, Ordering::Relaxed) != active {
        queue_overlay_visibility_sync(app);
    }
}

fn overlay_content_protected() -> bool {
    // macOS still lets its window picker select a protected overlay, then errors
    // when capturing it. Temporarily hide native windows for the system picker.
    #[cfg(target_os = "macos")]
    { false }
    #[cfg(not(target_os = "macos"))]
    { !OVERLAYS_CAPTURE_VISIBLE.load(Ordering::Relaxed) }
}

fn sync_overlay_visibility(app: &tauri::AppHandle) {
    let visible = overlays_visible();
    if APPLIED_OVERLAY_VISIBILITY.swap(visible, Ordering::Relaxed) == visible {
        return;
    }
    for (label, window) in app.webview_windows() {
        if !label.starts_with("overlay") {
            continue;
        }
        let _ = window.set_ignore_cursor_events(true);
        if visible {
            let _ = window.set_always_on_top(true);
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }
    // Native transitions reset pass-through; the poller must re-emit cursor
    // state so the frontend rebuilds hover from scratch.
    invalidate_cursor_cache();
    let _ = app.emit("overlay-visibility-changed", visible);
}

fn queue_overlay_visibility_sync(app: &tauri::AppHandle) {
    let handle = app.clone();
    // Re-read the latest choices on the UI thread so queued capture observations
    // cannot undo a later tray/settings action.
    let _ = app.run_on_main_thread(move || sync_overlay_visibility(&handle));
}

/// Cursor in one overlay window's local logical CSS pixels.
#[derive(Clone, serde::Serialize)]
struct CursorLocal {
    x: f64,
    y: f64,
    inside: bool,
}

fn primary_monitor_or_first(app: &tauri::AppHandle) -> Option<Monitor> {
    app.primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok().and_then(|mut list| list.pop()))
}

/// Desktop bounds in global logical points for the display matching this monitor.
#[cfg(target_os = "macos")]
fn cg_logical_bounds_for_monitor(monitor: &Monitor) -> Option<(f64, f64, f64, f64)> {
    use core_graphics::display::CGDisplay;
    let scale = monitor.scale_factor().max(0.01);
    let tao_x = f64::from(monitor.position().x);
    let tao_y = f64::from(monitor.position().y);

    let displays = CGDisplay::active_displays().ok()?;
    for id in displays {
        let display = CGDisplay::new(id);
        let b = display.bounds();
        // tao reports position as CGDisplayBounds.origin * scale
        let px = b.origin.x * scale;
        let py = b.origin.y * scale;
        if (px - tao_x).abs() < 2.0 && (py - tao_y).abs() < 2.0 {
            return Some((b.origin.x, b.origin.y, b.size.width, b.size.height));
        }
    }
    None
}

fn fit_overlay_to_monitor(window: &tauri::WebviewWindow, monitor: &Monitor) {
    // Prefer true desktop logical bounds — avoids tao size double-scaling
    // and mixed-DPI position errors that clip secondary displays.
    #[cfg(target_os = "macos")]
    {
        if let Some((x, y, w, h)) = cg_logical_bounds_for_monitor(monitor) {
            if w > 1.0 && h > 1.0 {
                let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                let _ = window.set_size(tauri::LogicalSize::new(w, h));
                return;
            }
        }
    }

    let scale = monitor.scale_factor().max(0.01);
    let pos = *monitor.position();
    let size = *monitor.size();
    let _ = window.set_position(tauri::LogicalPosition::new(
        f64::from(pos.x) / scale,
        f64::from(pos.y) / scale,
    ));
    let _ = window.set_size(tauri::LogicalSize::new(
        f64::from(size.width) / scale,
        f64::from(size.height) / scale,
    ));
}

/// True global cursor in physical pixels.
///
/// Tauri/tao `cursor_position` on macOS flips Y with **primary** height and
/// scales with **primary** DPI, so secondary monitors get wrong coords.
/// CGEvent gives a proper multi-monitor global point. The event source is
/// created once by the poller and only cloned per query.
#[cfg(target_os = "macos")]
fn global_cursor_physical(source: Option<&core_graphics::event_source::CGEventSource>) -> Option<(f64, f64)> {
    use core_graphics::event::CGEvent;
    let event = CGEvent::new(source?.clone()).ok()?;
    let loc = event.location();
    Some((loc.x, loc.y))
}

#[cfg(not(target_os = "macos"))]
fn global_cursor_physical(_app: &tauri::AppHandle) -> Option<(f64, f64)> {
    _app.webview_windows()
        .values()
        .find(|w| w.is_visible().unwrap_or(false))
        .and_then(|w| w.cursor_position().ok())
        .map(|p| (p.x, p.y))
}

/// Gap that treats a stalled poller iteration as system sleep → wake recovery.
const SYSTEM_RESUME_GAP: Duration = Duration::from_secs(2);

/// One global poller. Each overlay gets its own local coords via `emit_to`.
///
/// macOS: CGEvent is global **points**; window origin/size are physical —
/// subtract origin/scale from points (do NOT divide the result again).
/// Windows: cursor and window geometry are both **physical pixels** —
/// use (cursor - origin) / scale.
fn spawn_global_cursor_poller(app: tauri::AppHandle, running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut tick: u32 = 0;
        let mut last_display_fp = String::new();
        let mut last_loop = std::time::Instant::now();
        #[cfg(target_os = "macos")]
        let mut next_capture_check = last_loop;
        // Reused HID event source; cloning it per query beats re-creating.
        #[cfg(target_os = "macos")]
        let cursor_source = core_graphics::event_source::CGEventSource::new(
            core_graphics::event_source::CGEventSourceStateID::HIDSystemState,
        )
        .ok();
        let mut cursor_emits: HashMap<String, (f64, f64, bool)> = HashMap::new();
        let mut cursor_epoch = OVERLAY_LAYOUT_EPOCH.load(Ordering::Relaxed);
        while running.load(Ordering::Relaxed) {
            let now = std::time::Instant::now();
            let gap = now.duration_since(last_loop);
            last_loop = now;

            // System sleep freezes this thread; a long gap means we just woke.
            // Re-assert overlay z-order and let every overlay refresh viewport/audio.
            if gap >= SYSTEM_RESUME_GAP {
                set_overlays_always_on_top(&app, true);
                for (label, win) in app.webview_windows() {
                    if label.starts_with("overlay") {
                        let _ = win.emit("system-resumed", ());
                    }
                }
                // Primary must rebuild the multi-monitor layout immediately.
                // Clearing the fingerprint alone would make the next watchdog
                // tick treat the new monitor set as "initial" and skip the emit.
                last_display_fp = String::new();
                if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
                    let _ = win.emit("displays-changed", ());
                }
            }

            #[cfg(target_os = "macos")]
            if now >= next_capture_check {
                next_capture_check = now + Duration::from_millis(100);
                if (OVERLAYS_VISIBLE.load(Ordering::Relaxed)
                    && !OVERLAYS_CAPTURE_VISIBLE.load(Ordering::Relaxed))
                    || CAPTURE_SESSION_ACTIVE.load(Ordering::Relaxed)
                {
                    // Session start/end arrives from the input tap; this only
                    // applies timeouts, the exit grace, and the toolbar
                    // capture-file completion scan. No window queries.
                    let active = macos_capture::tick();
                    set_capture_session_active(&app, active);
                }
            }

            // Detection must continue while temporarily hidden, so cancel/end can
            // restore the overlays. Cursor hit testing remains paused meanwhile.
            if !overlays_visible() {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }

            // Hot-plug watchdog: rebuild overlay layout so orphaned windows close.
            tick = tick.wrapping_add(1);
            if tick % 32 == 0 {
                let fp = monitor_fingerprint(&app);
                if fp != last_display_fp {
                    if last_display_fp.is_empty() {
                        last_display_fp = fp;
                    } else {
                        last_display_fp = fp;
                        if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
                            let _ = win.emit("displays-changed", ());
                        }
                    }
                }
            }

            let epoch = OVERLAY_LAYOUT_EPOCH.load(Ordering::Relaxed);
            if epoch != cursor_epoch {
                cursor_epoch = epoch;
                cursor_emits.clear();
            }
            // Frontends evaluate hover per rAF frame from the cached payload,
            // so a bit-identical payload carries no new information — skip it.
            #[cfg(target_os = "macos")]
            let cursor = global_cursor_physical(cursor_source.as_ref());
            #[cfg(not(target_os = "macos"))]
            let cursor = global_cursor_physical(&app);
            if let Some((gx, gy)) = cursor {
                for (label, win) in app.webview_windows() {
                    if !label.starts_with("overlay") {
                        continue;
                    }
                    if !win.is_visible().unwrap_or(false) {
                        continue;
                    }
                    let Ok(origin) = win.outer_position() else {
                        continue;
                    };
                    let scale = win.scale_factor().unwrap_or(1.0).max(0.01);
                    let Ok(size) = win.outer_size() else {
                        continue;
                    };

                    let w = f64::from(size.width) / scale;
                    let h = f64::from(size.height) / scale;

                    let (lx, ly) = {
                        #[cfg(target_os = "macos")]
                        {
                            (
                                gx - f64::from(origin.x) / scale,
                                gy - f64::from(origin.y) / scale,
                            )
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            (
                                (gx - f64::from(origin.x)) / scale,
                                (gy - f64::from(origin.y)) / scale,
                            )
                        }
                    };

                    let inside = lx >= 0.0 && ly >= 0.0 && lx <= w && ly <= h;
                    if cursor_emits.get(label.as_str()) == Some(&(lx, ly, inside)) {
                        continue;
                    }
                    cursor_emits.insert(label.clone(), (lx, ly, inside));
                    let _ = win.emit_to(
                        &label,
                        "cursor-local",
                        CursorLocal {
                            x: lx,
                            y: ly,
                            inside,
                        },
                    );
                }
            } else {
                // Unknown cursor state — force the next observation to re-emit.
                cursor_emits.clear();
            }
            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

/// Stable id of the current monitor set (name + origin + size).
fn monitor_fingerprint(app: &tauri::AppHandle) -> String {
    let mut parts: Vec<String> = app
        .available_monitors()
        .ok()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            format!(
                "{}@{}x{}:{}x{}",
                m.name().map(|s| s.as_str()).unwrap_or(""),
                p.x,
                p.y,
                s.width,
                s.height
            )
        })
        .collect();
    parts.sort();
    parts.join("|")
}

fn configure_overlay_window(window: &tauri::WebviewWindow, monitor: &Monitor) {
    let _ = window.set_ignore_cursor_events(true);
    if let Err(err) = window.set_content_protected(overlay_content_protected()) {
        eprintln!("apply capture visibility to {} failed: {err}", window.label());
    }
    // Follow the user across Mission Control Spaces.
    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.set_always_on_top(true);
    fit_overlay_to_monitor(window, monitor);
    // Geometry changed — cached cursor payloads no longer apply.
    invalidate_cursor_cache();
    // Rebuilds and sleep/wake must preserve the user's native visibility choice.
    if overlays_visible() {
        let _ = window.show();
    } else {
        let _ = window.hide();
    }
}

fn toggle_overlay_visibility(app: &tauri::AppHandle) {
    let was_visible = OVERLAYS_VISIBLE.fetch_xor(true, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    if !was_visible {
        // Explicit Show is the guaranteed recovery from a mouse-dismissed
        // ⌘⇧5 toolbar, which leaves no key event for the tap to observe.
        macos_capture::cancel_session(app);
    }
    queue_overlay_visibility_sync(app);
}

/// Always map the primary monitor to label "overlay"; extra monitors get overlay-1, overlay-2...
fn apply_monitor_mode(app: &tauri::AppHandle, mode: &str) {
    let primary = primary_monitor_or_first(app);
    let mut others: Vec<Monitor> = app.available_monitors().ok().unwrap_or_default();

    if let Some(p) = &primary {
        others.retain(|m| m.name() != p.name());
        let mut targets = Vec::with_capacity(1 + others.len());
        targets.push(p.clone());
        targets.extend(others);
        others = targets;
    }

    let targets: Vec<Monitor> = if mode == "all" {
        others
    } else {
        primary.into_iter().collect()
    };

    if targets.is_empty() {
        return;
    }

    let desired: Vec<String> = targets
        .iter()
        .enumerate()
        .map(|(i, _)| {
            if i == 0 {
                OVERLAY_LABEL.to_string()
            } else {
                format!("overlay-{i}")
            }
        })
        .collect();

    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay") && !desired.contains(&label) {
            let _ = win.close();
        }
    }

    for (idx, monitor) in targets.iter().enumerate() {
        let label = &desired[idx];
        if let Some(win) = app.get_webview_window(label) {
            configure_overlay_window(&win, monitor);
            continue;
        }

        match WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App("index.html".into()))
            .title("BugScurry Overlay")
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focusable(false)
            .resizable(false)
            .shadow(false)
            .content_protected(overlay_content_protected())
            // Configure geometry and native visibility before showing a new screen.
            .visible(false)
            .visible_on_all_workspaces(true)
            .build()
        {
            Ok(win) => {
                configure_overlay_window(&win, monitor);
            }
            Err(err) => eprintln!("create overlay {label} failed: {err}"),
        }
    }
}

fn set_overlays_always_on_top(app: &tauri::AppHandle, on: bool) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay") {
            let _ = win.set_always_on_top(on);
        }
    }
}

fn open_or_focus_settings(app: &tauri::AppHandle) {
    // Keep the bug overlay always-on-top so the desktop pets stay visible
    // while settings is open. Settings is also always-on-top and is raised
    // + focused here; the overlay is click-through except when hovering a
    // bug, so the panel remains usable underneath the transparent layer.
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        let _ = win.set_always_on_top(true);
    } else {
        eprintln!("settings window not found; skip open");
    }
    // Re-assert overlay on top after the focus dance so bugs paint above
    // the panel instead of disappearing behind it.
    set_overlays_always_on_top(app, true);
}

#[tauri::command]
fn set_overlay_clickable(window: tauri::WebviewWindow, clickable: bool) {
    let visible = overlays_visible();
    let _ = window.set_ignore_cursor_events(!visible || !clickable);
}

#[tauri::command]
fn get_overlay_visible() -> bool {
    overlays_visible()
}

/// Replay cursor state after a frontend subscribes or clears its hover cache.
#[tauri::command]
fn request_overlay_cursor() {
    invalidate_cursor_cache();
}

#[tauri::command]
fn set_overlay_capture_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let previous = OVERLAYS_CAPTURE_VISIBLE.swap(visible, Ordering::Relaxed);
    let mut errors = Vec::new();
    for (label, window) in app.webview_windows() {
        if !label.starts_with("overlay") {
            continue;
        }
        if let Err(err) = window.set_content_protected(overlay_content_protected()) {
            let message = format!("apply capture visibility to {label} failed: {err}");
            eprintln!("{message}");
            errors.push(message);
        }
    }
    if errors.is_empty() {
        queue_overlay_visibility_sync(&app);
        Ok(())
    } else {
        // The settings UI rejects a failed update, so future windows must also
        // keep the previous choice. Restore every surviving/current overlay.
        OVERLAYS_CAPTURE_VISIBLE.store(previous, Ordering::Relaxed);
        for (label, window) in app.webview_windows() {
            if !label.starts_with("overlay") {
                continue;
            }
            if let Err(err) = window.set_content_protected(overlay_content_protected()) {
                eprintln!("restore capture visibility to {label} failed: {err}");
            }
        }
        Err(errors.join("; "))
    }
}

#[tauri::command]
fn get_overlay_scale(window: tauri::WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

#[derive(serde::Serialize)]
struct CaptureMonitorStatusDto {
    /// Whether this platform implements screenshot-session detection at all.
    supported: bool,
    /// macOS "Input Monitoring" (listen-event access) is granted.
    authorized: bool,
    /// A passive or active event tap is up.
    listening: bool,
    accessibility: bool,
    #[serde(rename = "canRecord")]
    can_record: bool,
}

#[cfg(target_os = "macos")]
fn capture_monitor_status_dto(app: &tauri::AppHandle) -> CaptureMonitorStatusDto {
    let status = macos_capture::status(app);
    CaptureMonitorStatusDto {
        supported: true,
        authorized: status.authorized,
        listening: status.listening,
        accessibility: status.accessibility,
        can_record: status.can_record,
    }
}

#[cfg(not(target_os = "macos"))]
fn capture_monitor_status_dto(_app: &tauri::AppHandle) -> CaptureMonitorStatusDto {
    CaptureMonitorStatusDto {
        supported: false,
        authorized: false,
        listening: false,
        accessibility: false,
        can_record: false,
    }
}

#[tauri::command]
fn set_capture_compatibility_enabled(app: tauri::AppHandle, enabled: bool) {
    #[cfg(target_os = "macos")]
    macos_capture::set_enabled(&app, enabled);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, enabled);
}

#[tauri::command]
fn get_capture_monitor_status(app: tauri::AppHandle) -> CaptureMonitorStatusDto {
    capture_monitor_status_dto(&app)
}

/// Async so the system permission prompt path never runs on the main thread.
#[tauri::command]
async fn request_capture_input_monitoring(app: tauri::AppHandle) -> CaptureMonitorStatusDto {
    #[cfg(target_os = "macos")]
    macos_capture::request_access(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = &app;
    capture_monitor_status_dto(&app)
}

/// Start recording a custom picker hotkey (the tap swallows keys).
#[tauri::command]
fn begin_hotkey_recording(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_capture::begin_hotkey_recording(&app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("Hotkey recording is only supported on macOS".into())
    }
}

#[tauri::command]
fn end_hotkey_recording() {
    #[cfg(target_os = "macos")]
    macos_capture::end_hotkey_recording();
}

/// Open System Settings on a known pane (macOS only; no-op elsewhere).
#[tauri::command]
fn open_settings_pane(pane: String) {
    #[cfg(target_os = "macos")]
    {
        let url = match pane.as_str() {
            "input-monitoring" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
            }
            "accessibility" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            }
            "login-items" => "x-apple.systempreferences:com.apple.LoginItems-Settings.extension",
            other => {
                eprintln!("unknown settings pane: {other}");
                return;
            }
        };
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    let _ = pane;
}

/// Persisted third-party screenshot picker hotkeys as `{ mods, keycode }`
/// (`mods` = "+"-joined cmd/shift/ctrl/alt/fn). Replaces the active list.
#[derive(serde::Deserialize)]
struct CaptureHotkey {
    mods: String,
    keycode: u16,
}

#[tauri::command]
fn set_capture_hotkeys(_app: tauri::AppHandle, hotkeys: Vec<CaptureHotkey>) {
    #[cfg(target_os = "macos")]
    macos_capture::set_custom_hotkeys(
        hotkeys.into_iter().map(|h| (h.mods, h.keycode)).collect(),
    );
    #[cfg(not(target_os = "macos"))]
    let _ = hotkeys;
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) {
    open_or_focus_settings(&app);
}

#[tauri::command]
fn apply_monitor_mode_cmd(app: tauri::AppHandle, mode: String) {
    apply_monitor_mode(&app, &mode);
}

/// Sleep/wake can leave secondary overlay WebViews as zombies (blank canvas,
/// stale geometry). Re-configuring the existing window is not enough — the
/// working manual workaround is toggling monitor mode, which closes and
/// recreates `overlay-*`. Do that automatically on resume.
#[tauri::command]
fn force_rebuild_overlays(app: tauri::AppHandle, mode: String) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay-") {
            let _ = win.close();
        }
    }
    apply_monitor_mode(&app, &mode);
    set_overlays_always_on_top(&app, true);
}

#[tauri::command]
fn apply_locale(
    app: tauri::AppHandle,
    locale: String,
    labels: Option<tray::TrayLabels>,
) {
    let _ = locale;
    let labels = labels.unwrap_or_default();
    let _ = tray::apply_tray_labels(&app, labels);
}

#[tauri::command]
fn set_tray_stats(app: tauri::AppHandle, kills: u32, best_combo: u32) {
    let _ = tray::apply_tray_stats(&app, kills, best_combo);
}

#[tauri::command]
fn set_tray_rain(app: tauri::AppHandle, raining: bool, kind: Option<String>) {
    let _ = tray::apply_rain_state(&app, raining, kind);
}

#[tauri::command]
fn set_tray_spray(app: tauri::AppHandle, spray_cooldown_sec: u32) {
    let _ = tray::apply_spray_cooldown(&app, spray_cooldown_sec);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Same command ids as the tray menu, used by OS-global shortcuts.
/// Short debounce: a focused app can deliver both the menu accelerator and
/// the global shortcut for one keypress.
fn emit_tray_command(app: &tauri::AppHandle, cmd: &str) {
    {
        use std::time::{Duration, Instant};
        static LAST: Mutex<Option<(String, Instant)>> = Mutex::new(None);
        let now = Instant::now();
        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((prev, t)) = last.as_ref() {
            if prev == cmd && now.duration_since(*t) < Duration::from_millis(150) {
                return;
            }
        }
        *last = Some((cmd.to_string(), now));
    }

    match cmd {
        "open_settings" => open_or_focus_settings(app),
        // app.exit alone can leave a tray ghost on Windows; force process end.
        "quit" => {
            app.exit(0);
            std::process::exit(0);
        }
        other => tray::emit_tray_to_overlays(app, other),
    }
}

/// Register system-wide shortcuts.
///
/// macOS: do **not** register here. The tray menu already exposes
/// CmdOrCtrl accelerators and NSStatusItem delivers them system-wide;
/// a global-shortcut hook can steal the keypress before the menu sees it
/// (user had to click around before anything ran).
#[cfg(not(target_os = "macos"))]
fn register_global_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    for spec in [
        "CmdOrCtrl+Equal",
        "CmdOrCtrl+Minus",
        "CmdOrCtrl+R",
        "CmdOrCtrl+Comma",
        "CmdOrCtrl+Q",
    ] {
        match spec.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            Ok(sc) => {
                if let Err(err) = app.global_shortcut().register(sc) {
                    eprintln!("register shortcut {spec} failed: {err}");
                }
            }
            Err(err) => eprintln!("parse shortcut {spec} failed: {err}"),
        }
    }
}

#[cfg(target_os = "macos")]
fn register_global_shortcuts(_app: &tauri::AppHandle) {}

pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch exits instead of stacking tray icons
        // and a second overlay (which looked like +2 bugs per tray click).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_or_focus_settings(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            // Registered only on Windows/Linux (see register_global_shortcuts).
            // macOS uses tray menu accelerators so the hook never steals ⌘ keys.
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Never let a panic in the hotkey thread take the app down.
                    let app = app.clone();
                    let key = shortcut.key;
                    let mods = shortcut.mods;
                    let pressed = event.state()
                        == tauri_plugin_global_shortcut::ShortcutState::Pressed;
                    if !pressed {
                        return;
                    }
                    use tauri_plugin_global_shortcut::{Code, Modifiers};
                    if !(mods.contains(Modifiers::CONTROL) || mods.contains(Modifiers::SUPER))
                        || mods.contains(Modifiers::SHIFT)
                    {
                        return;
                    }
                    let cmd = match key {
                        Code::Equal => "add_one",
                        Code::Minus => "remove_one",
                        Code::KeyR => "regenerate",
                        Code::Comma => "open_settings",
                        Code::KeyQ => "quit",
                        _ => return,
                    };
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                        emit_tray_command(&app, cmd);
                    }));
                })
                .build(),
        )
        .manage(Arc::new(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![
            set_overlay_clickable,
            get_overlay_visible,
            request_overlay_cursor,
            set_overlay_capture_visible,
            get_capture_monitor_status,
            set_capture_compatibility_enabled,
            request_capture_input_monitoring,
            set_capture_hotkeys,
            begin_hotkey_recording,
            end_hotkey_recording,
            open_settings_pane,
            get_overlay_scale,
            open_settings_window,
            apply_monitor_mode_cmd,
            force_rebuild_overlays,
            apply_locale,
            set_tray_stats,
            set_tray_rain,
            set_tray_spray,
            quit_app
        ])
        .setup(|app| {
            let handle = app.handle();
            // Screenshot sessions are detected by listening for the system
            // shortcuts; nothing to observe at startup.
            #[cfg(target_os = "macos")]
            macos_capture::init(handle);
            if let Some(window) = handle.get_webview_window(OVERLAY_LABEL) {
                if let Some(monitor) = primary_monitor_or_first(handle) {
                    configure_overlay_window(&window, &monitor);
                }
            }
            APPLIED_OVERLAY_VISIBILITY.store(overlays_visible(), Ordering::Relaxed);
            let running = handle.state::<Arc<AtomicBool>>().inner().clone();
            spawn_global_cursor_poller(handle.clone(), running);
            tray::setup_tray(handle)?;
            register_global_shortcuts(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label();
            if label == "settings" {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // Actually close — hide+prevent_close left a stuck blank window on Windows.
                        let _ = window.hide();
                        api.prevent_close();
                        set_overlays_always_on_top(window.app_handle(), true);
                    }
                    WindowEvent::Focused(false) => {
                        // Overlay stays on top; nothing to demote.
                    }
                    WindowEvent::Focused(true) => {
                        // Re-raise the overlay after the panel takes focus so
                        // bugs remain visible above the settings chrome.
                        set_overlays_always_on_top(window.app_handle(), true);
                    }
                    _ => {}
                }
            }
            if label.starts_with("overlay") {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.set_ignore_cursor_events(true);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<Arc<AtomicBool>>()
                    .store(false, Ordering::Relaxed);
            }
        });
}

#[cfg(test)]
mod capture_status_tests {
    use super::CaptureMonitorStatusDto;

    #[test]
    fn capture_status_serializes_permissions_and_actual_recording_capability() {
        let payload = serde_json::to_value(CaptureMonitorStatusDto {
            supported: true,
            authorized: true,
            listening: true,
            accessibility: true,
            can_record: false, // permission alone does not make a passive tap active
        }).unwrap();
        assert_eq!(payload, serde_json::json!({
            "supported": true,
            "authorized": true,
            "listening": true,
            "accessibility": true,
            "canRecord": false,
        }));
    }
}
