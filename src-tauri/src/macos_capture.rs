//! Detect Apple's screenshot and screen-recording sessions from input events.
//! A `CGEventTap` compares key codes and modifier flags against the system
//! screenshot shortcuts — it passes everything through, never reads text
//! content, and stores nothing. The single exception: while the user records
//! a custom picker hotkey in settings, key-downs are swallowed for a few
//! seconds so no third-party app fires (captured keys are discarded after the
//! combo is forwarded to the settings window). Requires the macOS "Input
//! Monitoring" permission; without it the app reports that clearly instead of
//! guessing.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use core_foundation::base::TCFType;
use core_foundation::mach_port::CFMachPort;
use core_foundation::runloop::{kCFRunLoopCommonModes, kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{CGEventFlags, KeyCode};

use tauri::Emitter;

use crate::capture_guard::CaptureGuard;

/// kVK_ANSI_3/4/5 — the system screenshot digits. ⌘⇧3 captures on key-down
/// (nothing can hide before that frame), ⌘⇧4 opens the picker, ⌘⇧5 the toolbar.
const KEY_DIGIT_3: u16 = 0x14;
const KEY_DIGIT_4: u16 = 0x15;
const KEY_DIGIT_5: u16 = 0x17;
const KEY_ESCAPE: u16 = 0x35;
/// Third-party picker hotkeys are user-configurable (`set_capture_hotkeys`).
/// Defaults: WeChat screenshot ⌘⌃A and Snipaste Fn+F1.
const DEFAULT_HOTKEYS: [(&str, u16); 2] = [("fn", KEY_F1), ("cmd+ctrl", KEY_A)];
const KEY_A: u16 = 0x00;
const KEY_F1: u16 = 0x7A;

// CGEvent constants (hand-rolled tap: the core-graphics wrapper cannot
// express swallowing events, which the hotkey recorder needs).
const TAP_SESSION: u32 = 1;
const TAP_HEAD_INSERT: u32 = 0;
const TAP_ACTIVE: u32 = 0;
const TAP_LISTEN_ONLY: u32 = 1;
const EVENT_KEY_DOWN: u32 = 10;
const EVENT_KEY_UP: u32 = 11;
const EVENT_LEFT_UP: u32 = 2;
const EVENT_RIGHT_UP: u32 = 4;
const EVENT_OTHER_UP: u32 = 26;
const EVENT_TAP_DISABLED_LOW: u32 = 0xFFFF_FFFE;
const EVENT_TAP_DISABLED_HIGH: u32 = 0xFFFF_FFFF;
const FIELD_KEYBOARD_EVENT_KEYCODE: u32 = 9;
const EVENT_MASK: u64 = (1 << EVENT_KEY_DOWN)
    | (1 << EVENT_KEY_UP)
    | (1 << EVENT_LEFT_UP)
    | (1 << EVENT_RIGHT_UP)
    | (1 << EVENT_OTHER_UP);

#[derive(Clone, Copy, Debug, PartialEq)]
struct CustomHotkey {
    flags: u64,
    keycode: u16,
}

static CUSTOM_HOTKEYS: Mutex<Vec<CustomHotkey>> = Mutex::new(Vec::new());
const RECORDING_TIMEOUT: Duration = Duration::from_secs(10);
static RECORDING: Mutex<HotkeyRecorder> = Mutex::new(HotkeyRecorder::new());

#[derive(Debug, PartialEq)]
enum RecordedKey {
    PassThrough,
    Capture,
    SuppressRepeat,
}

struct HotkeyRecorder {
    deadline: Option<Instant>,
    captured_key: Option<u16>,
}

impl HotkeyRecorder {
    const fn new() -> Self {
        Self {
            deadline: None,
            captured_key: None,
        }
    }

    fn begin(&mut self, now: Instant) {
        self.deadline = Some(now + RECORDING_TIMEOUT);
        self.captured_key = None;
    }

    fn stop(&mut self) {
        self.deadline = None;
        self.captured_key = None;
    }

    fn key_down(&mut self, keycode: u16, now: Instant) -> RecordedKey {
        let Some(until) = self.deadline else {
            return RecordedKey::PassThrough;
        };
        if now >= until {
            self.stop();
            return RecordedKey::PassThrough;
        }
        match self.captured_key {
            None => {
                self.captured_key = Some(keycode);
                RecordedKey::Capture
            }
            Some(key) if key == keycode => RecordedKey::SuppressRepeat,
            Some(_) => RecordedKey::PassThrough,
        }
    }

    fn key_up(&mut self, keycode: u16, now: Instant) -> bool {
        if self.captured_key == Some(keycode) {
            let consume = self.deadline.is_some_and(|until| now < until);
            self.stop();
            consume
        } else {
            false
        }
    }
}

fn parse_mods(mods: &str) -> Option<u64> {
    let mut flags = 0u64;
    for part in mods.split('+').filter(|part| !part.is_empty()) {
        let flag = match part {
            "cmd" | "command" => CGEventFlags::CGEventFlagCommand,
            "shift" => CGEventFlags::CGEventFlagShift,
            "ctrl" | "control" => CGEventFlags::CGEventFlagControl,
            "alt" | "option" => CGEventFlags::CGEventFlagAlternate,
            "fn" => CGEventFlags::CGEventFlagSecondaryFn,
            _ => return None,
        };
        flags |= flag.bits();
    }
    Some(flags)
}

/// Replace the custom picker hotkeys (frontend pushes the persisted list).
pub(crate) fn set_custom_hotkeys(hotkeys: Vec<(String, u16)>) {
    let mut list = Vec::with_capacity(hotkeys.len());
    for (mods, keycode) in hotkeys {
        if let Some(flags) = parse_mods(&mods) {
            list.push(CustomHotkey { flags, keycode });
        }
    }
    *CUSTOM_HOTKEYS.lock().unwrap_or_else(|err| err.into_inner()) = list;
}

/// Exact modifier match; legacy browser-recorded entries without modifiers
/// also accept a lone Fn flag. Native recordings preserve Fn explicitly.
fn custom_hotkey_matched(keycode: u16, flags: CGEventFlags) -> bool {
    const MODIFIER_MASK: CGEventFlags = CGEventFlags::CGEventFlagCommand
        .union(CGEventFlags::CGEventFlagShift)
        .union(CGEventFlags::CGEventFlagControl)
        .union(CGEventFlags::CGEventFlagAlternate)
        .union(CGEventFlags::CGEventFlagSecondaryFn);
    let mods = flags & MODIFIER_MASK;
    let list = CUSTOM_HOTKEYS.lock().unwrap_or_else(|err| err.into_inner());
    list.iter().any(|hotkey| {
        hotkey.keycode == keycode
            && (mods.bits() == hotkey.flags
                || (hotkey.flags == 0 && mods == CGEventFlags::CGEventFlagSecondaryFn))
    })
}

/// Canonical modifier tag order for the recorded-hotkey payload.
fn mods_string(flags: CGEventFlags) -> String {
    let has = |flag: CGEventFlags| flags.contains(flag);
    [
        ("cmd", CGEventFlags::CGEventFlagCommand),
        ("ctrl", CGEventFlags::CGEventFlagControl),
        ("alt", CGEventFlags::CGEventFlagAlternate),
        ("shift", CGEventFlags::CGEventFlagShift),
        ("fn", CGEventFlags::CGEventFlagSecondaryFn),
    ]
    .into_iter()
    .filter(|(_, flag)| has(*flag))
    .map(|(name, _)| name)
    .collect::<Vec<_>>()
    .join("+")
}

#[derive(Clone, serde::Serialize)]
struct HotkeyCaptured {
    mods: String,
    keycode: u16,
    cancelled: bool,
}

extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        mask: u64,
        callback: CGEventTapCallback,
        userInfo: *mut c_void,
    ) -> *mut c_void;
    fn CGEventGetFlags(event: *mut c_void) -> u64;
    fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Whether Accessibility (辅助功能) trust is granted — the active tap needs it
/// to swallow keys while recording a custom picker shortcut.
pub(crate) fn accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

type CGEventTapCallback = unsafe extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void;

/// Shared guard state between the tap callback and the visibility poller.
static GUARD: Mutex<CaptureGuard> = Mutex::new(CaptureGuard::new());
static ENABLED: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_enabled(app: &tauri::AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::Release);
    if !enabled {
        end_hotkey_recording();
        *GUARD.lock().unwrap_or_else(|err| err.into_inner()) = CaptureGuard::new();
        crate::set_capture_session_active(app, false);
    }
    let _ = status(app);
}
// Requested and installed modes stay distinct: an active-tap creation can
// fall back to passive listening and needs another attempt after authorization.
const MODE_STOPPED: usize = 0;
const MODE_PASSIVE: usize = 1;
const MODE_ACTIVE: usize = 2;
static REQUESTED_MODE: AtomicUsize = AtomicUsize::new(MODE_STOPPED);
static INSTALLED_MODE: AtomicUsize = AtomicUsize::new(MODE_STOPPED);
static TAP_THREAD_RUNNING: AtomicBool = AtomicBool::new(false);
static RECONFIGURE: AtomicBool = AtomicBool::new(false);
/// Only accessed by the owning tap thread and its callbacks.
static TAP_PORT: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone, Copy, Debug)]
pub(crate) struct CaptureStatus {
    pub authorized: bool,
    pub listening: bool,
    pub accessibility: bool,
    pub can_record: bool,
}

fn requested_mode(authorized: bool, accessibility: bool) -> usize {
    // A modifying event tap uses Accessibility authorization. Input Monitoring
    // is the separate authorization path for listen-only taps, not an extra
    // prerequisite for an already-authorized active tap.
    if accessibility {
        MODE_ACTIVE
    } else if authorized {
        MODE_PASSIVE
    } else {
        MODE_STOPPED
    }
}

fn capture_status(authorized: bool, accessibility: bool, installed: usize) -> CaptureStatus {
    CaptureStatus {
        authorized,
        listening: (authorized || accessibility) && installed != MODE_STOPPED,
        accessibility,
        can_record: accessibility && installed == MODE_ACTIVE,
    }
}

/// Start the listener at app launch when permission is already granted.
pub(crate) fn init(app: &tauri::AppHandle) {
    let defaults = DEFAULT_HOTKEYS
        .iter()
        .map(|(mods, keycode)| ((*mods).to_string(), *keycode))
        .collect();
    set_custom_hotkeys(defaults);
    let _ = status(app);
}

/// Status refresh also starts/reconfigures the tap after permission changes.
pub(crate) fn status(app: &tauri::AppHandle) -> CaptureStatus {
    let authorized = preflight_listen_access();
    let accessibility = accessibility_trusted();
    let enabled = ENABLED.load(Ordering::Acquire);
    ensure_tap(app, if enabled { requested_mode(authorized, accessibility) } else { MODE_STOPPED });
    let installed = INSTALLED_MODE.load(Ordering::Acquire);
    capture_status(authorized, accessibility, if enabled { installed } else { MODE_STOPPED })
}

pub(crate) fn request_access(app: &tauri::AppHandle) -> CaptureStatus {
    if !preflight_listen_access() && !accessibility_trusted() {
        let _ = unsafe { CGRequestListenEventAccess() };
    }
    status(app)
}

/// Recording requires an actual active tap, not just permission. A native
/// deadline also prevents a hidden/suspended settings WebView leaving it armed.
pub(crate) fn begin_hotkey_recording(app: &tauri::AppHandle) -> Result<(), String> {
    if !status(app).can_record {
        return Err("Hotkey recording requires Accessibility and an active listener".into());
    }
    RECORDING.lock().unwrap_or_else(|err| err.into_inner())
        .begin(Instant::now());
    Ok(())
}

pub(crate) fn end_hotkey_recording() {
    RECORDING.lock().unwrap_or_else(|err| err.into_inner()).stop();
}

/// Explicit user Show overrides a stuck session (e.g. a ⌘⇧5 toolbar
/// dismissed with the mouse, which yields no key event for the tap).
/// Manual Hide still wins: the visibility flag is applied separately.
pub(crate) fn cancel_session(app: &tauri::AppHandle) {
    GUARD
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .cancel();
    crate::set_capture_session_active(app, false);
}

fn preflight_listen_access() -> bool {
    unsafe { CGPreflightListenEventAccess() }
}

fn ensure_tap(app: &tauri::AppHandle, requested: usize) {
    REQUESTED_MODE.store(requested, Ordering::Release);
    let installed = INSTALLED_MODE.load(Ordering::Acquire);
    if installed != MODE_STOPPED && installed != requested {
        RECONFIGURE.store(true, Ordering::Release);
    }
    if requested == MODE_STOPPED
        || TAP_THREAD_RUNNING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
    {
        return;
    }
    let app = app.clone();
    if std::thread::Builder::new()
        .name("capture-listener".into())
        .spawn(move || {
            run_tap(app);
            TAP_THREAD_RUNNING.store(false, Ordering::Release);
        })
        .is_err()
    {
        TAP_THREAD_RUNNING.store(false, Ordering::Release);
    }
}

fn run_tap(app: tauri::AppHandle) {
    // The box stays owned by this thread and outlives every installed tap.
    let context = Box::new(app);
    let user_info = (&*context as *const tauri::AppHandle).cast_mut().cast::<c_void>();
    let runloop = CFRunLoop::get_current();
    loop {
        RECONFIGURE.store(false, Ordering::Release);
        let requested = REQUESTED_MODE.load(Ordering::Acquire);
        if requested == MODE_STOPPED {
            return;
        }
        let options = if requested == MODE_ACTIVE { TAP_ACTIVE } else { TAP_LISTEN_ONLY };
        let mut port = unsafe {
            CGEventTapCreate(
                TAP_SESSION, TAP_HEAD_INSERT, options, EVENT_MASK, tap_callback, user_info,
            )
        };
        let mut installed = requested;
        if port.is_null() && requested == MODE_ACTIVE {
            port = unsafe {
                CGEventTapCreate(
                    TAP_SESSION, TAP_HEAD_INSERT, TAP_LISTEN_ONLY, EVENT_MASK, tap_callback, user_info,
                )
            };
            installed = MODE_PASSIVE;
        }
        if port.is_null() {
            return;
        }
        // SAFETY: freshly created CFMachPortRef; the tap is released only after
        // its source has been removed and no callback is running on this thread.
        let tap = unsafe { CFMachPort::wrap_under_create_rule(port.cast()) };
        let Ok(source) = tap.create_runloop_source(0) else {
            return;
        };
        TAP_PORT.store(tap.as_concrete_TypeRef() as usize, Ordering::Release);
        runloop.add_source(&source, unsafe { kCFRunLoopCommonModes });
        unsafe { CGEventTapEnable(port, true) };
        INSTALLED_MODE.store(installed, Ordering::Release);
        while !RECONFIGURE.load(Ordering::Acquire)
            && REQUESTED_MODE.load(Ordering::Acquire) == requested
        {
            // No permission/window polling here; this bounds reconfiguration
            // latency without sharing a potentially freed run-loop pointer.
            CFRunLoop::run_in_mode(
                unsafe { kCFRunLoopDefaultMode }, Duration::from_millis(250), false,
            );
        }
        INSTALLED_MODE.store(MODE_STOPPED, Ordering::Release);
        end_hotkey_recording();
        unsafe { CGEventTapEnable(port, false) };
        runloop.remove_source(&source, unsafe { kCFRunLoopCommonModes });
        TAP_PORT.store(0, Ordering::Release);
    }
}

/// SAFETY contract: macOS calls this on the tap's run loop with a valid
/// event reference; returning null swallows the event, returning it passes on.
unsafe extern "C" fn tap_callback(
    _proxy: *mut c_void,
    event_type: u32,
    event: *mut c_void,
    user_info: *mut c_void,
) -> *mut c_void {
    // Disabled-tap notifications may not carry an input event.
    if matches!(event_type, EVENT_TAP_DISABLED_LOW | EVENT_TAP_DISABLED_HIGH) {
        let port = TAP_PORT.load(Ordering::Acquire) as *mut c_void;
        if !port.is_null() {
            CGEventTapEnable(port, true);
        }
        return event;
    }
    if event.is_null() || !ENABLED.load(Ordering::Acquire) {
        return event;
    }
    let app = &*(user_info as *const tauri::AppHandle);
    match event_type {
        EVENT_KEY_DOWN => {
            let keycode = CGEventGetIntegerValueField(event, FIELD_KEYBOARD_EVENT_KEYCODE) as u16;
            let flags = CGEventGetFlags(event);
            let recording = RECORDING.lock().unwrap_or_else(|err| err.into_inner())
                .key_down(keycode, Instant::now());
            if recording == RecordedKey::SuppressRepeat {
                return std::ptr::null_mut();
            }
            if recording == RecordedKey::Capture {
                let payload = HotkeyCaptured {
                    mods: mods_string(CGEventFlags::from_bits_truncate(flags)),
                    keycode,
                    cancelled: keycode == KEY_ESCAPE,
                };
                let _ = app.emit_to("settings", "hotkey-captured", payload);
                // Swallowed: no other app's global shortcut fires.
                return std::ptr::null_mut();
            }
            handle_key_event(app, keycode, CGEventFlags::from_bits_truncate(flags));
        }
        EVENT_KEY_UP => {
            let keycode = CGEventGetIntegerValueField(event, FIELD_KEYBOARD_EVENT_KEYCODE) as u16;
            if RECORDING.lock().unwrap_or_else(|err| err.into_inner()).key_up(keycode, Instant::now()) {
                return std::ptr::null_mut();
            }
        }
        EVENT_LEFT_UP | EVENT_RIGHT_UP | EVENT_OTHER_UP => {
            apply_event(app, |guard, now| guard.mouse_up(now));
        }
        _ => {}
    }
    event
}

fn handle_key_event(app: &tauri::AppHandle, keycode: u16, flags: CGEventFlags) {
    let has = |flag: CGEventFlags| flags.contains(flag);
    let cmd = has(CGEventFlags::CGEventFlagCommand);
    let shift = has(CGEventFlags::CGEventFlagShift);
    let ctrl = has(CGEventFlags::CGEventFlagControl);

    // The system screenshot shortcuts with ⌃ variants (capture to clipboard),
    // plus third-party picker hotkeys handled as ⌘⇧4-style selections.
    match keycode {
        KEY_DIGIT_3 if cmd && shift => {
            // Captures immediately on key-down; hiding now is too late and
            // stays documented as a best-effort gap.
        }
        KEY_DIGIT_4 if cmd && shift => {
            debug_log("selection session started (cmd+shift+4)");
            apply_event(app, |guard, now| guard.selection_started(now));
        }
        KEY_DIGIT_5 if cmd && shift => {
            debug_log("toolbar session started (cmd+shift+5)");
            apply_event(app, |guard, now| guard.toolbar_started(now));
        }
        KeyCode::ESCAPE if cmd && ctrl => {
            debug_log("stop-recording shortcut pressed");
            apply_event(app, |guard, now| guard.stop_recording_pressed(now));
        }
        KeyCode::ESCAPE if !cmd && !ctrl => {
            debug_log("escape pressed");
            apply_event(app, |guard, now| guard.escape_pressed(now));
        }
        KeyCode::RETURN if !cmd && !ctrl => {
            apply_event(app, |guard, now| guard.confirm_pressed(now));
        }
        // Space only switches ⌘⇧4 to window picking — same session continues.
        _ => {}
    }

    if custom_hotkey_matched(keycode, flags) {
        debug_log("selection session started (custom hotkey)");
        apply_event(app, |guard, now| guard.selection_started(now));
    }
}

fn apply_event(
    app: &tauri::AppHandle,
    event: impl FnOnce(&mut CaptureGuard, Instant),
) {
    let now = Instant::now();
    let active = {
        let mut guard = GUARD.lock().unwrap_or_else(|err| err.into_inner());
        event(&mut guard, now);
        guard.effective_active(now)
    };
    crate::set_capture_session_active(app, active);
}

/// Stderr diagnostics, enabled only with `BUGSCURRY_CAPTURE_DEBUG=1`
/// (dev runs). Off by default: session edges would otherwise spam the log.
fn capture_debug() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("BUGSCURRY_CAPTURE_DEBUG")
            .map(|value| value != "0")
            .unwrap_or(false)
    })
}

fn debug_log(message: &str) {
    if capture_debug() {
        eprintln!("[capture] {message}");
    }
}

/// Timeout/grace bookkeeping for the visibility poller; session edges arrive
/// through the tap callback, so this never queries the window list.
/// While a ⌘⇧5 toolbar session is active this also watches the screenshot
/// save location for a newly written capture file — toolbar option clicks
/// and in-recording input write no files, so only a completed capture (or a
/// stopped recording) ends the session. Only names and mtimes are read.
pub(crate) fn tick() -> bool {
    let now = Instant::now();
    let pending_scan = {
        let mut guard = GUARD.lock().unwrap_or_else(|err| err.into_inner());
        let active = guard.effective_active(now);
        if !active {
            return false;
        }
        if guard.completion_scan_due(now) {
            guard.toolbar_wall()
        } else {
            None
        }
    };
    if let Some(since) = pending_scan {
        // Subprocess + directory reads stay outside the guard lock.
        let dir = completion_dir_for(since);
        debug_log(&format!("scanning {} for capture files", dir.display()));
        if scan_dir_for_completion(&dir, since) {
            debug_log("capture file found, ending toolbar session");
            let end = Instant::now();
            let mut guard = GUARD.lock().unwrap_or_else(|err| err.into_inner());
            guard.toolbar_capture_done(end);
            return guard.effective_active(end);
        }
    }
    true
}

/// Image/movie extensions the system toolbar writes for captures.
const COMPLETION_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "tiff", "pdf", "mov", "mp4"];

/// Save-directory cache, keyed by toolbar session start (prefs may change
/// between sessions; re-resolve per session, at most ~1/s).
static COMPLETION_DIR_CACHE: Mutex<(Option<SystemTime>, Option<std::path::PathBuf>)> =
    Mutex::new((None, None));

fn completion_dir_for(session_start: SystemTime) -> std::path::PathBuf {
    let mut cache = COMPLETION_DIR_CACHE
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    if cache.0 == Some(session_start) {
        if let Some(dir) = cache.1.clone() {
            return dir;
        }
    }
    let dir = screenshot_save_dir();
    *cache = (Some(session_start), Some(dir.clone()));
    dir
}

/// Save location from the screencapture prefs; Desktop when unset/unreadable.
/// (A save-to-clipboard toolbar flow writes no file and keeps Esc recovery.)
fn screenshot_save_dir() -> std::path::PathBuf {
    if let Ok(output) = std::process::Command::new("/usr/bin/defaults")
        .args(["read", "com.apple.screencapture", "location"])
        .output()
    {
        if output.status.success() {
            let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let expanded = match raw.strip_prefix("~/") {
                Some(rest) => std::env::var("HOME")
                    .map(|home| format!("{home}/{rest}"))
                    .unwrap_or(raw),
                None => raw,
            };
            let path = std::path::PathBuf::from(expanded);
            if path.is_dir() {
                return path;
            }
        }
    }
    std::env::var("HOME")
        .map(|home| std::path::PathBuf::from(format!("{home}/Desktop")))
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn is_completion_candidate(file_name: &str, mtime: SystemTime, since: SystemTime) -> bool {
    if mtime < since {
        return false;
    }
    file_name
        .rsplit('.')
        .next()
        .is_some_and(|ext| COMPLETION_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

fn scan_dir_for_completion(dir: &std::path::Path, since: SystemTime) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.filter_map(|entry| entry.ok()).any(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .is_some_and(|mtime| is_completion_candidate(&name, mtime, since))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completion_candidates_need_fresh_media_files() {
        let since = SystemTime::now() - Duration::from_secs(60);
        assert!(is_completion_candidate("Screenshot 2026-10-07 at 9.41.00 AM.png", SystemTime::now(), since));
        assert!(is_completion_candidate("Screen Recording 2026-10-07 at 9.41.00 AM.mov", SystemTime::now(), since));
        assert!(is_completion_candidate("shot.JPG", SystemTime::now(), since));
        // Stale files, non-media extensions, and extensionless names never end it.
        assert!(!is_completion_candidate("Screenshot old.png", since - Duration::from_secs(1), since));
        assert!(!is_completion_candidate("notes.txt", SystemTime::now(), since));
        assert!(!is_completion_candidate("Screenshot", SystemTime::now(), since));
    }

    #[test]
    fn completion_scan_sees_only_files_written_after_session_start() {
        let base = std::env::temp_dir().join(format!(
            "bugscurry-completion-probe-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("old.png"), b"old").unwrap();

        // A session starting now: the pre-existing file must not match.
        let since = SystemTime::now();
        assert!(!scan_dir_for_completion(&base, since));

        // Toolbar capture lands while the session is active.
        std::fs::write(base.join("Screenshot fresh.png"), b"new").unwrap();
        assert!(scan_dir_for_completion(&base, since));

        // A fresh non-media file (e.g. an unrelated download) is ignored.
        let _ = std::fs::remove_file(base.join("Screenshot fresh.png"));
        std::fs::write(base.join("download.txt"), b"new").unwrap();
        assert!(!scan_dir_for_completion(&base, since));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn permission_changes_select_the_required_tap_mode() {
        assert_eq!(requested_mode(false, false), MODE_STOPPED);
        assert_eq!(requested_mode(false, true), MODE_ACTIVE);
        assert_eq!(requested_mode(true, false), MODE_PASSIVE);
        assert_eq!(requested_mode(true, true), MODE_ACTIVE);
    }

    #[test]
    fn accessibility_alone_allows_listening_and_recording_once_installed() {
        let pending = capture_status(false, true, MODE_STOPPED);
        assert!(!pending.authorized);
        assert!(!pending.listening);
        assert!(!pending.can_record);

        let active = capture_status(false, true, MODE_ACTIVE);
        assert!(!active.authorized); // raw Input Monitoring remains independent
        assert!(active.accessibility);
        assert!(active.listening);
        assert!(active.can_record);

        let passive = capture_status(true, false, MODE_PASSIVE);
        assert!(passive.listening);
        assert!(!passive.can_record);
        assert!(!capture_status(false, false, MODE_ACTIVE).can_record);
    }

    #[test]
    fn recorded_modifiers_preserve_fn_and_round_trip() {
        let flags = CGEventFlags::CGEventFlagCommand | CGEventFlags::CGEventFlagSecondaryFn;
        let mods = mods_string(flags);
        assert_eq!(mods, "cmd+fn");
        assert_eq!(parse_mods(&mods), Some(flags.bits()));
        assert_eq!(mods_string(CGEventFlags::CGEventFlagSecondaryFn), "fn");
    }

    #[test]
    fn recorded_shortcut_and_its_repeats_never_reach_capture_detection() {
        let now = Instant::now();
        let mut recorder = HotkeyRecorder::new();
        let mut guard = CaptureGuard::new();
        recorder.begin(now);
        for millis in [0, 100, 200] {
            let at = now + Duration::from_millis(millis);
            let decision = recorder.key_down(KEY_DIGIT_4, at);
            if decision == RecordedKey::PassThrough { guard.selection_started(at); }
            assert!(!guard.effective_active(at));
        }
        assert!(recorder.key_up(KEY_DIGIT_4, now + Duration::from_millis(300)));
        assert_eq!(recorder.key_down(KEY_DIGIT_4, now + Duration::from_millis(400)), RecordedKey::PassThrough);
    }

    #[test]
    fn recording_deadline_and_cancellation_restore_normal_keys() {
        let now = Instant::now();
        let mut recorder = HotkeyRecorder::new();
        recorder.begin(now);
        assert_eq!(recorder.key_down(KEY_A, now + RECORDING_TIMEOUT), RecordedKey::PassThrough);
        recorder.begin(now);
        assert_eq!(recorder.key_down(KEY_A, now), RecordedKey::Capture);
        assert_eq!(recorder.key_down(KEY_A, now + RECORDING_TIMEOUT), RecordedKey::PassThrough);
        recorder.begin(now);
        recorder.stop();
        assert_eq!(recorder.key_down(KEY_A, now), RecordedKey::PassThrough);
    }
}
