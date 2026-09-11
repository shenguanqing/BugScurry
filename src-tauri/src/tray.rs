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
    pub settings: String,
    pub quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            toggle: "显示 / 隐藏虫子".into(),
            add: "增加一只".into(),
            remove: "减少一只".into(),
            regen: "重新生成".into(),
            settings: "设置…".into(),
            quit: "退出".into(),
        }
    }
}

fn build_menu(app: &tauri::AppHandle, labels: &TrayLabels) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "toggle_visibility", &labels.toggle, true, None::<&str>)?;
    let add = MenuItem::with_id(
        app,
        "add_one",
        &labels.add,
        true,
        Some("CmdOrCtrl+Equal"),
    )?;
    let remove = MenuItem::with_id(app, "remove_one", &labels.remove, true, Some("CmdOrCtrl+-"))?;
    let regen = MenuItem::with_id(app, "regenerate", &labels.regen, true, Some("CmdOrCtrl+R"))?;
    let settings = MenuItem::with_id(
        app,
        "open_settings",
        &labels.settings,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, Some("CmdOrCtrl+Q"))?;
    Menu::with_items(app, &[&show, &add, &remove, &regen, &settings, &quit])
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
        other => {
            if let Some(window) = app.get_webview_window("overlay") {
                let _ = window.emit("tray-command", other);
            }
        }
    }
}

pub fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let labels = TrayLabels::default();
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
    let Some(tray) = app.tray_by_id("main-tray") else {
        return setup_tray(app);
    };
    let menu = build_menu(app, &labels)?;
    tray.set_menu(Some(menu))?;
    Ok(())
}
