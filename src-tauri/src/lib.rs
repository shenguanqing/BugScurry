use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, WindowEvent};

mod tray;

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

fn setup_overlay(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("overlay") else {
        eprintln!("overlay window not found");
        return;
    };

    // Default: pass mouse events through to the desktop.
    if let Err(err) = window.set_ignore_cursor_events(true) {
        eprintln!("set_ignore_cursor_events failed: {err}");
    }

    if let Some(monitor) = primary_monitor_or_first(app) {
        fit_overlay_to_monitor(&window, &monitor);
    }

    // Sample cursor position and forward to the frontend for hit-testing.
    let poll_window = window.clone();
    let running = app.state::<Arc<AtomicBool>>().inner().clone();
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            if let Ok(pos) = poll_window.cursor_position() {
                let scale = poll_window.scale_factor().unwrap_or(1.0).max(0.01);
                let payload = CursorPayload {
                    x: pos.x / scale,
                    y: pos.y / scale,
                };
                let _ = poll_window.emit("cursor-position", payload);
            }
            std::thread::sleep(Duration::from_millis(33));
        }
    });
}

#[tauri::command]
fn set_overlay_clickable(window: tauri::WebviewWindow, clickable: bool) {
    let _ = window.set_ignore_cursor_events(!clickable);
}

#[tauri::command]
fn get_overlay_scale(window: tauri::WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AtomicBool::new(true)))
        .invoke_handler(tauri::generate_handler![
            set_overlay_clickable,
            get_overlay_scale
        ])
        .setup(|app| {
            setup_overlay(app.handle());
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "overlay" {
                return;
            }
            if let WindowEvent::Focused(false) = event {
                let _ = window.set_ignore_cursor_events(true);
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
