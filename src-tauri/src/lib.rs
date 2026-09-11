use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{
    Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod tray;

const OVERLAY_LABEL: &str = "overlay";

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

fn fit_overlay_to_monitor(window: &tauri::WebviewWindow, monitor: &Monitor) {
    let pos = *monitor.position();
    let size = *monitor.size();
    if let Err(err) = window.set_position(PhysicalPosition::new(pos.x, pos.y)) {
        eprintln!("set_position failed: {err}");
    }
    if let Err(err) = window.set_size(PhysicalSize::new(size.width, size.height)) {
        eprintln!("set_size failed: {err}");
    }
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
fn spawn_global_cursor_poller(app: tauri::AppHandle, running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
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
                    let lx = (gx - f64::from(origin.x)) / scale;
                    let ly = (gy - f64::from(origin.y)) / scale;
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

fn configure_overlay_window(window: &tauri::WebviewWindow, monitor: &Monitor) {
    let _ = window.set_ignore_cursor_events(true);
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
            .build()
        {
            Ok(win) => {
                configure_overlay_window(&win, monitor);
            }
            Err(err) => eprintln!("create overlay {label} failed: {err}"),
        }
    }
}

fn open_or_focus_settings(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    match WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("BugScurry 设置")
        .inner_size(420.0, 640.0)
        .resizable(false)
        .center()
        .always_on_top(true)
        .skip_taskbar(false)
        .visible(true)
        .build()
    {
        Ok(win) => {
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
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Arc::new(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![
            set_overlay_clickable,
            get_overlay_scale,
            open_settings_window,
            apply_monitor_mode_cmd,
            quit_app
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

            // Global shortcuts: Command/Ctrl + + and Command/Ctrl + ,
            let primary_mod = if cfg!(target_os = "macos") {
                Modifiers::SUPER
            } else {
                Modifiers::CONTROL
            };
            let add_one = Shortcut::new(Some(primary_mod | Modifiers::SHIFT), Code::Equal);
            let open_settings = Shortcut::new(Some(primary_mod), Code::Comma);

            handle
                .global_shortcut()
                .on_shortcut(add_one, |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
                            let _ = window.emit("tray-command", "add_one");
                        }
                    }
                })?;

            handle
                .global_shortcut()
                .on_shortcut(open_settings, |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        open_or_focus_settings(app);
                    }
                })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label();
            if label == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
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
