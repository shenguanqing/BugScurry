use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct TrayLabels {
    pub toggle: String,
    pub add: String,
    pub remove: String,
    pub regen: String,
    pub bait: String,
    pub feed: String,
    pub sugar: String,
    pub fruit: String,
    pub rain: String,
    pub rain_off: String,
    pub rain_light: String,
    pub rain_moderate: String,
    pub rain_heavy: String,
    pub rain_downpour: String,
    pub rain_thunder: String,
    pub rain_snow: String,
    pub rain_fog: String,
    pub rain_sand: String,
    pub spray: String,
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
            feed: "投喂".into(),
            sugar: "放一颗糖".into(),
            fruit: "放一块水果".into(),
            rain: "下雨".into(),
            rain_off: "停止".into(),
            rain_light: "小雨".into(),
            rain_moderate: "中雨".into(),
            rain_heavy: "大雨".into(),
            rain_downpour: "暴雨".into(),
            rain_thunder: "雷阵雨".into(),
            rain_snow: "雪".into(),
            rain_fog: "雾".into(),
            rain_sand: "沙尘".into(),
            spray: "喷雾杀虫剂".into(),
            settings: "设置…".into(),
            quit: "退出".into(),
            stats: "今日战绩".into(),
        }
    }
}

/// Last stats line shown in the tray (updated from the overlay).
/// Stores numbers only so locale changes can re-format the label.
static TRAY_STATS: Mutex<Option<(u32, u32)>> = Mutex::new(None);
/// Last labels from the frontend so stats refresh keeps the UI language.
static LAST_LABELS: Mutex<Option<TrayLabels>> = Mutex::new(None);
/// Ensure the OS tray icon is created at most once per process.
static TRAY_CREATED: AtomicBool = AtomicBool::new(false);
/// Active shower for checkmarks: (raining, kind). Kind is only set while raining.
static RAIN_STATE: Mutex<(bool, Option<String>)> = Mutex::new((false, None));
/// Remaining cooldown seconds for the spray item; 0 = ready.
/// Primary overlay owns the countdown and pushes it every second.
static SPRAY_COOLDOWN: Mutex<u32> = Mutex::new(0);
/// Live spray menu item so cooldown ticks update text in place (no set_menu flash).
static SPRAY_ITEM: Mutex<Option<MenuItem<tauri::Wry>>> = Mutex::new(None);

fn spray_cooldown_sec() -> u32 {
    *SPRAY_COOLDOWN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn cooldown_label(base: &str, remaining_sec: u32) -> String {
    if remaining_sec == 0 {
        base.to_string()
    } else {
        format!("{base} · {remaining_sec}s")
    }
}

fn rain_state() -> (bool, Option<String>) {
    RAIN_STATE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

fn kind_checked(kind: &str) -> bool {
    let (raining, current) = rain_state();
    raining && current.as_deref() == Some(kind)
}

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
        match *s {
            Some((kills, best_combo)) => {
                format!("{}: {} · {}×", labels.stats, kills, best_combo)
            }
            None => labels.stats.clone(),
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
        None::<&str>,
    )?;
    let sugar = MenuItem::with_id(app, "drop_sugar", &labels.sugar, true, None::<&str>)?;
    let fruit = MenuItem::with_id(app, "drop_fruit", &labels.fruit, true, None::<&str>)?;
    let feed = Submenu::with_items(app, &labels.feed, true, &[&bait, &sugar, &fruit])?;
    let (raining, _) = rain_state();
    // Checkmarks show the live weather; strength items are one-shot starts.
    let rain_off = CheckMenuItem::with_id(
        app,
        "rain_off",
        &labels.rain_off,
        true,
        !raining,
        None::<&str>,
    )?;
    let rain_light = CheckMenuItem::with_id(
        app,
        "rain_light",
        &labels.rain_light,
        true,
        kind_checked("light"),
        None::<&str>,
    )?;
    let rain_moderate = CheckMenuItem::with_id(
        app,
        "rain_moderate",
        &labels.rain_moderate,
        true,
        kind_checked("moderate"),
        None::<&str>,
    )?;
    let rain_heavy = CheckMenuItem::with_id(
        app,
        "rain_heavy",
        &labels.rain_heavy,
        true,
        kind_checked("heavy"),
        None::<&str>,
    )?;
    let rain_downpour = CheckMenuItem::with_id(
        app,
        "rain_downpour",
        &labels.rain_downpour,
        true,
        kind_checked("downpour"),
        None::<&str>,
    )?;
    let rain_thunder = CheckMenuItem::with_id(
        app,
        "rain_thunder",
        &labels.rain_thunder,
        true,
        kind_checked("thunder"),
        None::<&str>,
    )?;
    let rain_snow = CheckMenuItem::with_id(
        app,
        "rain_snow",
        &labels.rain_snow,
        true,
        kind_checked("snow"),
        None::<&str>,
    )?;
    let rain_fog = CheckMenuItem::with_id(
        app,
        "rain_fog",
        &labels.rain_fog,
        true,
        kind_checked("fog"),
        None::<&str>,
    )?;
    let rain_sand = CheckMenuItem::with_id(
        app,
        "rain_sand",
        &labels.rain_sand,
        true,
        kind_checked("sand"),
        None::<&str>,
    )?;
    let rain = Submenu::with_items(
        app,
        &labels.rain,
        true,
        &[
            &rain_off,
            &rain_light,
            &rain_moderate,
            &rain_heavy,
            &rain_downpour,
            &rain_thunder,
            &rain_snow,
            &rain_fog,
            &rain_sand,
        ],
    )?;
    let settings = MenuItem::with_id(
        app,
        "open_settings",
        &labels.settings,
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, Some("CmdOrCtrl+Q"))?;
    let spray_cd = spray_cooldown_sec();
    let spray = MenuItem::with_id(
        app,
        "prank_spray",
        &cooldown_label(&labels.spray, spray_cd),
        spray_cd == 0,
        None::<&str>,
    )?;
    *SPRAY_ITEM.lock().unwrap_or_else(|e| e.into_inner()) = Some(spray.clone());
    // Status → visibility → population → tools → interact → environment → app.
    Menu::with_items(
        app,
        &[
            &stats,
            &show,
            &add,
            &remove,
            &regen,
            &spray,
            &feed,
            &rain,
            &settings,
            &quit,
        ],
    )
}

fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    match id {
        "quit" => app.exit(0),
        "open_settings" => super::open_or_focus_settings(app),
        "today_stats" => {}
        other => emit_tray_to_overlays(app, other),
    }
}

/// Spray must hit every display; other commands stay on the primary overlay.
pub fn emit_tray_to_overlays(app: &tauri::AppHandle, cmd: &str) {
    if cmd == "prank_spray" {
        for (label, win) in app.webview_windows() {
            if label == "overlay" || label.starts_with("overlay-") {
                let _ = win.emit("tray-command", cmd);
            }
        }
        return;
    }
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("tray-command", cmd);
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
pub fn apply_tray_stats(
    app: &tauri::AppHandle,
    kills: u32,
    best_combo: u32,
) -> tauri::Result<()> {
    {
        let mut s = TRAY_STATS.lock().unwrap_or_else(|e| e.into_inner());
        *s = Some((kills, best_combo));
    }
    let Some(tray) = app.tray_by_id("main-tray") else {
        return Ok(());
    };
    let menu = build_menu(app, &current_labels())?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

/// Update weather checkmarks (stop / light / moderate / …).
pub fn apply_rain_state(
    app: &tauri::AppHandle,
    raining: bool,
    kind: Option<String>,
) -> tauri::Result<()> {
    {
        let mut s = RAIN_STATE.lock().unwrap_or_else(|e| e.into_inner());
        *s = (raining, if raining { kind } else { None });
    }
    let Some(tray) = app.tray_by_id("main-tray") else {
        return Ok(());
    };
    let menu = build_menu(app, &current_labels())?;
    tray.set_menu(Some(menu))?;
    Ok(())
}

/// Update spray cooldown label in place (avoids set_menu closing an open tray).
pub fn apply_spray_cooldown(_app: &tauri::AppHandle, spray_cooldown_sec: u32) -> tauri::Result<()> {
    {
        let mut s = SPRAY_COOLDOWN.lock().unwrap_or_else(|e| e.into_inner());
        *s = spray_cooldown_sec;
    }
    let labels = current_labels();
    if let Some(item) = SPRAY_ITEM
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        item.set_text(cooldown_label(&labels.spray, spray_cooldown_sec))?;
        item.set_enabled(spray_cooldown_sec == 0)?;
    }
    Ok(())
}
