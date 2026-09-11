use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

pub fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Accelerators only apply while this tray menu is open (not system-wide).
    let show = MenuItem::with_id(app, "toggle_visibility", "显示 / 隐藏虫子", true, None::<&str>)?;
    let add = MenuItem::with_id(app, "add_one", "增加一只", true, Some("CmdOrCtrl+Equal"))?;
    let remove = MenuItem::with_id(app, "remove_one", "减少一只", true, Some("CmdOrCtrl+-"))?;
    let regen = MenuItem::with_id(app, "regenerate", "重新生成", true, Some("CmdOrCtrl+R"))?;
    let settings = MenuItem::with_id(app, "open_settings", "设置…", true, Some("CmdOrCtrl+,"))?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(app, &[&show, &add, &remove, &regen, &settings, &quit])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(
            tauri::image::Image::from_bytes(include_bytes!("../icons/tray-32.png"))
                .expect("tray icon"),
        )
        .icon_as_template(true)
        .tooltip("BugScurry")
        .menu(&menu)
        // Native menu on left click (OS closes it after each action).
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "open_settings" => {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else if let Some(window) = app.get_webview_window("overlay") {
                    let _ = window.emit("tray-command", "open_settings");
                }
            }
            id => {
                if let Some(window) = app.get_webview_window("overlay") {
                    let _ = window.emit("tray-command", id);
                }
            }
        })
        .build(app)?;

    Ok(())
}
