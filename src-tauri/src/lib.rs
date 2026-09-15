use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    Emitter, Manager, Monitor, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

mod tray;

const OVERLAY_LABEL: &str = "overlay";

/// When false, the cursor poller idles instead of sampling CGEvent every 16ms.
static CURSOR_POLLER_ENABLED: AtomicBool = AtomicBool::new(true);

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
/// CGEvent gives a proper multi-monitor global point.
fn global_cursor_physical(_app: &tauri::AppHandle) -> Option<(f64, f64)> {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::event::CGEvent;
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
        let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).ok()?;
        let event = CGEvent::new(source).ok()?;
        let loc = event.location();
        return Some((loc.x, loc.y));
    }
    #[cfg(not(target_os = "macos"))]
    {
        _app.webview_windows()
            .values()
            .find(|w| w.is_visible().unwrap_or(false))
            .and_then(|w| w.cursor_position().ok())
            .map(|p| (p.x, p.y))
    }
}

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
        while running.load(Ordering::Relaxed) {
            if !CURSOR_POLLER_ENABLED.load(Ordering::Relaxed) {
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

            if let Some((gx, gy)) = global_cursor_physical(&app) {
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
    // Follow the user across Mission Control Spaces.
    let _ = window.set_visible_on_all_workspaces(true);
    fit_overlay_to_monitor(window, monitor);
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
            .visible(true)
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
    // Full-screen always-on-top overlays can sit above settings on Windows.
    // Drop them a level while the settings window is open.
    set_overlays_always_on_top(app, false);

    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        return;
    }

    match WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("BugScurry Settings")
        .inner_size(420.0, 640.0)
        .resizable(false)
        .decorations(true)
        .transparent(false)
        .center()
        .always_on_top(true)
        .skip_taskbar(false)
        .focused(true)
        .visible(true)
        .build()
    {
        Ok(win) => {
            let _ = win.set_always_on_top(true);
            let _ = win.show();
            let _ = win.set_focus();
        }
        Err(err) => eprintln!("open settings failed: {err}"),
    }
}

#[tauri::command]
fn set_overlay_clickable(window: tauri::WebviewWindow, clickable: bool) {
    let _ = window.set_ignore_cursor_events(!clickable);
}

#[tauri::command]
fn get_overlay_scale(window: tauri::WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) {
    open_or_focus_settings(&app);
}

#[tauri::command]
fn apply_monitor_mode_cmd(app: tauri::AppHandle, mode: String) {
    apply_monitor_mode(&app, &mode);
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
fn set_tray_stats(app: tauri::AppHandle, label: String) {
    let _ = tray::apply_tray_stats(&app, label);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_cursor_poller_enabled(enabled: bool) {
    CURSOR_POLLER_ENABLED.store(enabled, Ordering::Relaxed);
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

    if cmd == "open_settings" {
        open_or_focus_settings(app);
        return;
    }
    if cmd == "quit" {
        app.exit(0);
        return;
    }
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.emit("tray-command", cmd);
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
        "CmdOrCtrl+B",
        "CmdOrCtrl+Comma",
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
            if let Some(win) = app.get_webview_window("settings") {
                let _ = win.show();
                let _ = win.set_focus();
            }
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
                    if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    use tauri_plugin_global_shortcut::{Code, Modifiers};
                    let mod_ok = shortcut.mods.contains(Modifiers::CONTROL)
                        || shortcut.mods.contains(Modifiers::SUPER);
                    if !mod_ok || shortcut.mods.contains(Modifiers::SHIFT) {
                        return;
                    }
                    let cmd = match shortcut.key {
                        Code::Equal => "add_one",
                        Code::Minus => "remove_one",
                        Code::KeyR => "regenerate",
                        Code::KeyB => "drop_bait",
                        Code::Comma => "open_settings",
                        _ => return,
                    };
                    emit_tray_command(app, cmd);
                })
                .build(),
        )
        .manage(Arc::new(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![
            set_overlay_clickable,
            get_overlay_scale,
            open_settings_window,
            apply_monitor_mode_cmd,
            apply_locale,
            set_tray_stats,
            quit_app,
            set_cursor_poller_enabled
        ])
        .setup(|app| {
            let handle = app.handle();
            if let Some(window) = handle.get_webview_window(OVERLAY_LABEL) {
                if let Some(monitor) = primary_monitor_or_first(handle) {
                    configure_overlay_window(&window, &monitor);
                }
            }
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
                        // Keep overlays pass-through when settings is not focused.
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
