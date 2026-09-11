use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};

const TRAY_POPUP: &str = "tray-popup";

fn open_tray_popup(app: &tauri::AppHandle, rect: tauri::Rect) {
    if let Some(win) = app.get_webview_window(TRAY_POPUP) {
        position_popup(&win, rect);
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    match WebviewWindowBuilder::new(app, TRAY_POPUP, WebviewUrl::App("tray-popup.html".into()))
        .title("BugScurry")
        .inner_size(220.0, 250.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(true)
        .visible(true)
        .build()
    {
        Ok(win) => {
            position_popup(&win, rect);
            let _ = win.show();
            let _ = win.set_focus();
        }
        Err(err) => eprintln!("open tray popup failed: {err}"),
    }
}

fn position_popup(win: &tauri::WebviewWindow, rect: tauri::Rect) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let (icon_x, icon_y, icon_w, icon_h) = match (&rect.position, &rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            (f64::from(p.x), f64::from(p.y), f64::from(s.width), f64::from(s.height))
        }
        (tauri::Position::Logical(p), tauri::Size::Logical(s)) => (
            p.x * scale,
            p.y * scale,
            s.width * scale,
            s.height * scale,
        ),
        (tauri::Position::Physical(p), tauri::Size::Logical(s)) => (
            f64::from(p.x),
            f64::from(p.y),
            s.width * scale,
            s.height * scale,
        ),
        (tauri::Position::Logical(p), tauri::Size::Physical(s)) => (
            p.x * scale,
            p.y * scale,
            f64::from(s.width),
            f64::from(s.height),
        ),
    };

    let w = 220.0 * scale;
    let x = icon_x + (icon_w / 2.0) - (w / 2.0);
    let y = icon_y + icon_h + 4.0;
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn emit_to_overlay(app: &tauri::AppHandle, cmd: &str) {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("tray-command", cmd);
    }
}

pub fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Right-click native menu (quick fallback). Left-click opens the sticky popup.
    let show = MenuItem::with_id(app, "toggle_visibility", "显示 / 隐藏虫子", true, None::<&str>)?;
    // Command/Ctrl + +  (mac: ⌘= is the + key next to backspace; also ⇧⌘=)
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
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "open_settings" => {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
                    emit_to_overlay(app, "open_settings");
                }
            }
            id => emit_to_overlay(app, id),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                open_tray_popup(tray.app_handle(), rect);
            }
        })
        .build(app)?;

    Ok(())
}
