use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

#[derive(Debug, Clone, Deserialize)]
pub struct TrayLabels {
    pub toggle: String,
    pub add: String,
    pub remove: String,
    pub regen: String,
    pub bait: String,
    pub settings: String,
    pub quit: String,
    pub stats: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            toggle: "显示 / 隐藏虫子".into(),
            add: "增加一只".into(),
            remove: "减少一只".into(),
            regen: "重新生成".into(),
            bait: "扔一块饼干".into(),
            settings: "设置…".into(),
            quit: "退出".into(),
            stats: "今日战绩".into(),
        }
    }
}

/// Last stats line shown in the tray (updated from the overlay).
static TRAY_STATS: Mutex<String> = Mutex::new(String::new());
/// Last labels from the frontend so stats refresh keeps the UI language.
static LAST_LABELS: Mutex<Option<TrayLabels>> = Mutex::new(None);
/// Ensure the OS tray icon is created at most once per process.
static TRAY_CREATED: AtomicBool = AtomicBool::new(false);

fn store_labels(labels: TrayLabels) {
    let mut guard = LAST_LABELS.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(labels);
}

fn current_labels() -> TrayLabels {
    let guard = LAST_LABELS.lock().unwrap_or_else(|e| e.into_inner());
    guard.clone().unwrap_or_default()
}

fn build_menu(app: &tauri::AppHandle, labels: &TrayLabels) -> tauri::Result<Menu<tauri::Wry>> {
    let stats_text = {
        let s = TRAY_STATS.lock().unwrap_or_else(|e| e.into_inner());
        if s.is_empty() {
            labels.stats.clone()
        } else {
            s.clone()
        }
    };
    let stats = MenuItem::with_id(app, "today_stats", &stats_text, false, None::<&str>)?;
    let show = MenuItem::with_id(app, "toggle_visibility", &labels.toggle, true, None::<&str>)?;
    // Native accelerators render right-aligned. emit_tray_command debounces
    // the rare double-fire with the OS-global shortcut.
    let add = MenuItem::with_id(
        app,
        "add_one",
        &labels.add,
        true,
        Some("CmdOrCtrl+Equal"),
    )?;
    let remove = MenuItem::with_id(app, "remove_one", &labels.remove, true, Some("CmdOrCtrl+-"))?;
    let regen = MenuItem::with_id(app, "regenerate", &labels.regen, true, Some("CmdOrCtrl+R"))?;
    let bait = MenuItem::with_id(
        app,
        "drop_bait",
        &labels.bait,
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let settings = MenuItem::with_id(
        app,
        "open_settings",
        &labels.settings,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&stats, &show, &add, &remove, &regen, &bait, &settings, &quit],
    )
}

fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    match id {
        "quit" => app.exit(0),
        "open_settings" => {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            } else if let Some(window) = app.get_webview_window("overlay") {
                let _ = window.emit("tray-command", "open_settings");
            }
        }
        "today_stats" => {}
        other => {
            if let Some(window) = app.get_webview_window("overlay") {
                let _ = window.emit("tray-command", other);
            }
        }
    }
}

pub fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Only one OS tray icon per process. Overlay + settings both call
    // apply_locale on startup; without this guard a second build() stacked
    // a second icon (and a second add/remove target).
    if TRAY_CREATED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let labels = TrayLabels::default();
    store_labels(labels.clone());
    let menu = build_menu(app, &labels)?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(
            tauri::image::Image::from_bytes(include_bytes!("../icons/tray-32.png"))
                .expect("tray icon"),
        )
        .tooltip("BugScurry")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu_event(app, event.id.as_ref()));

    #[cfg(target_os = "macos")]
    let tray = tray.icon_as_template(true);

    let _tray = tray.build(app)?;
    Ok(())
}

/// Replace tray menu labels (called when UI language changes).
pub fn apply_tray_labels(app: &tauri::AppHandle, labels: TrayLabels) -> tauri::Result<()> {
    store_labels(labels.clone());
    let Some(tray) = app.tray_by_id("main-tray") else {
        // Do not recreate here — setup_tray owns creation.
        return Ok(());
    };
    let menu = build_menu(app, &labels)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

/// Refresh the disabled "today" line and rebuild the menu.
pub fn apply_tray_stats(app: &tauri::AppHandle, label: String) -> tauri::Result<()> {
    {
        let mut s = TRAY_STATS.lock().unwrap_or_else(|e| e.into_inner());
        *s = label;
    }
    let Some(tray) = app.tray_by_id("main-tray") else {
        return Ok(());
    };
    let menu = build_menu(app, &current_labels())?;
    tray.set_menu(Some(menu))?;
    Ok(())
}