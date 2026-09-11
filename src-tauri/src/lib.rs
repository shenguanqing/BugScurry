use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{
    Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

mod tray;

const OVERLAY_LABEL: &str = "overlay";

#[derive(Clone, serde::Serialize)]
struct CursorPayload {
    x: f64,
    y: f64,
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

fn spawn_cursor_poller(window: tauri::WebviewWindow, running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            if !window.is_visible().unwrap_or(true) {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            if let Ok(pos) = window.cursor_position() {
                let scale = window.scale_factor().unwrap_or(1.0).max(0.01);
                // Convert global physical coords into this window's logical space.
                let origin = window.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
                let payload = CursorPayload {
                    x: (pos.x - origin.x as f64) / scale,
                    y: (pos.y - origin.y as f64) / scale,
                };
                let _ = window.emit("cursor-position", payload);
            }
            std::thread::sleep(Duration::from_millis(33));
        }
    });
}

fn configure_overlay_window(window: &tauri::WebviewWindow, monitor: &Monitor) {
    let _ = window.set_ignore_cursor_events(true);
    fit_overlay_to_monitor(window, monitor);
}

/// mode: "primary" keeps one overlay on the main display; "all" adds one per monitor.
fn apply_monitor_mode(app: &tauri::AppHandle, mode: &str) {
    let monitors = app
        .available_monitors()
        .ok()
        .unwrap_or_default();
    let primary = primary_monitor_or_first(app);

    let mut targets: Vec<Monitor> = Vec::new();
    if mode == "all" {
        targets = monitors;
    } else if let Some(p) = primary {
        targets.push(p);
    }
    if targets.is_empty() {
        return;
    }

    // Desired labels
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

    // Close extra overlays
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay") && !desired.contains(&label) {
            let _ = win.close();
        }
    }

    let running = app.state::<Arc<AtomicBool>>().inner().clone();

    for (idx, monitor) in targets.iter().enumerate() {
        let label = &desired[idx];
        if let Some(win) = app.get_webview_window(label) {
            configure_overlay_window(&win, monitor);
            continue;
        }

        let builder = WebviewWindowBuilder::new(
            app,
            label.clone(),
            WebviewUrl::App("index.html".into()),
        )
        .title("BugScurry Overlay")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .resizable(false)
        .shadow(false)
        .visible(true);

        match builder.build() {
            Ok(win) => {
                configure_overlay_window(&win, monitor);
                spawn_cursor_poller(win, running.clone());
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
        .inner_size(420.0, 620.0)
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
                let running = handle.state::<Arc<AtomicBool>>().inner().clone();
                spawn_cursor_poller(window, running);
            }
            tray::setup_tray(handle)?;
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
