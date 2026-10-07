#[cfg(any(target_os = "macos", test))]
use std::time::{Duration, Instant, SystemTime};

/// Let the system finish writing the capture before overlays return.
#[cfg(any(target_os = "macos", test))]
const CAPTURE_EXIT_GRACE: Duration = Duration::from_millis(400);

/// Bound for a ⌘⇧4-style selection so a lost end signal cannot hide bugs forever.
#[cfg(any(target_os = "macos", test))]
const SELECTION_TIMEOUT: Duration = Duration::from_secs(600);

/// Bound for a ⌘⇧5 toolbar session (clicks may start a screen recording whose
/// end is not observable from input events alone; Esc restores sooner).
#[cfg(any(target_os = "macos", test))]
const TOOLBAR_TIMEOUT: Duration = Duration::from_secs(1800);

/// Tracks screenshot sessions from input events, separately from the user's
/// visibility choice. Overlays must be suppressed while a session is active
/// and for one grace period after it ends.
///
/// Session rules (input events only, system shortcuts never intercepted):
/// - ⌘⇧4-style selections (also user-defined third-party picker hotkeys) end
///   on mouse release, Esc, or Enter.
/// - ⌘⇧5 (re)starts a toolbar session. Mouse input can change options or
///   adjust a region without capturing, so only Esc, stop-recording, or the
///   30-minute bound ends it (including timed captures).
#[derive(Default)]
#[cfg(any(target_os = "macos", test))]
pub(crate) struct CaptureGuard {
    selection: Option<Instant>,
    toolbar: Option<Instant>,
    exited_since: Option<Instant>,
    /// Wall-clock start of the toolbar session, so the poller can treat a
    /// newly saved screenshot/recording file as the completion signal.
    toolbar_wall: Option<SystemTime>,
    /// Last capture-dir scan; scans run at most ~1/s while toolbar is active.
    completion_scan_at: Option<Instant>,
}

#[cfg(any(target_os = "macos", test))]
impl CaptureGuard {
    pub(crate) const fn new() -> Self {
        Self {
            selection: None,
            toolbar: None,
            exited_since: None,
            toolbar_wall: None,
            completion_scan_at: None,
        }
    }

    /// ⌘⇧4 or a custom third-party picker hotkey: the selection UI appears.
    pub(crate) fn selection_started(&mut self, now: Instant) {
        self.selection = Some(now);
        self.exited_since = None;
    }

    /// ⌘⇧5: the toolbar opens, re-opens over a possible recording, or closes
    /// (system toggle). Every press (re)starts the session; Esc restores, and
    /// a newly saved capture file ends it (see `toolbar_capture_done`).
    pub(crate) fn toolbar_started(&mut self, now: Instant) {
        self.toolbar = Some(now);
        self.toolbar_wall = Some(SystemTime::now());
        self.exited_since = None;
    }

    /// Esc: cancels a selection and closes the toolbar session in any phase.
    /// During a screen recording this restores bugs too — the guaranteed
    /// recording path is tray Hide (documented best effort).
    pub(crate) fn escape_pressed(&mut self, now: Instant) {
        // Sequential takes: `||` would short-circuit and leak the rest.
        let selection = self.selection.take().is_some();
        let toolbar = self.toolbar.take().is_some();
        self.toolbar_wall = None;
        if selection || toolbar {
            self.mark_exit(now);
        }
    }

    /// Enter confirms a ⌘⇧4 selection. From the toolbar it only triggers the
    /// capture button while the toolbar stays open, so the session continues —
    /// but the capture file lands right after, so scan for it immediately.
    pub(crate) fn confirm_pressed(&mut self, now: Instant) {
        if self.selection.take().is_some() {
            self.mark_exit(now);
        }
        self.kick_completion_scan();
    }

    /// ⌘⌃Esc is the system stop-recording shortcut; it also ends anything else.
    pub(crate) fn stop_recording_pressed(&mut self, now: Instant) {
        let selection = self.selection.take().is_some();
        let toolbar = self.toolbar.take().is_some();
        self.toolbar_wall = None;
        if selection || toolbar {
            self.mark_exit(now);
        }
    }

    /// Mouse release ends only a ⌘⇧4-style selection. Toolbar clicks and region
    /// adjustments do not tell us whether capture has actually finished, but
    /// the Capture click writes its file right after — scan for it immediately.
    pub(crate) fn mouse_up(&mut self, now: Instant) {
        if self.selection.take().is_some() {
            self.mark_exit(now);
        }
        self.kick_completion_scan();
    }

    /// Explicit user Show overrides any session immediately with no exit
    /// grace — the user asked for the overlays back (e.g. a ⌘⇧5 toolbar
    /// dismissed with the mouse, which yields no key event). Never used
    /// for Hide, so a manual Hide choice stays in force.
    pub(crate) fn cancel(&mut self) {
        *self = Self::new();
    }

    /// A new screenshot/recording file appeared while the toolbar session was
    /// active: the capture completed (toolbar capture writes a file; stopping
    /// a recording writes the movie). Ends the session with the normal exit
    /// grace. Toolbar option clicks and in-recording input write no files,
    /// so they cannot trigger this.
    pub(crate) fn toolbar_capture_done(&mut self, now: Instant) {
        let selection = self.selection.take().is_some();
        let toolbar = self.toolbar.take().is_some();
        self.toolbar_wall = None;
        if selection || toolbar {
            self.mark_exit(now);
        }
    }

    /// Wall-clock start of the toolbar session for capture-file detection.
    pub(crate) fn toolbar_wall(&self) -> Option<SystemTime> {
        self.toolbar_wall
    }

    /// True at most twice per second while a toolbar session is active; only
    /// the visibility poller calls this to throttle capture-dir scans.
    /// Toolbar input (mouse release, Enter) calls `kick_completion_scan` so
    /// the click on Capture is followed by a scan within ~100ms instead of
    /// waiting out the throttle — the scan, not the click, ends the session.
    pub(crate) fn completion_scan_due(&mut self, now: Instant) -> bool {
        const SCAN_INTERVAL: Duration = Duration::from_millis(500);
        if self.toolbar.is_some()
            && self
                .completion_scan_at
                .is_none_or(|at| now.duration_since(at) >= SCAN_INTERVAL)
        {
            self.completion_scan_at = Some(now);
            return true;
        }
        false
    }

    /// Toolbar input expedites the next capture-dir scan (clears the
    /// throttle) without ending the session: option clicks and region drags
    /// scan early and find nothing, while the Capture click finds its file
    /// on the very next poll.
    pub(crate) fn kick_completion_scan(&mut self) {
        if self.toolbar.is_some() {
            self.completion_scan_at = None;
        }
    }

    /// Whether overlays must stay hidden, applying session timeouts and the
    /// exit grace. Callers poll this; session edges arrive from input events.
    pub(crate) fn effective_active(&mut self, now: Instant) -> bool {
        if self
            .selection
            .is_some_and(|since| now.duration_since(since) >= SELECTION_TIMEOUT)
        {
            self.selection = None;
            self.mark_exit(now);
        }
        if self
            .toolbar
            .is_some_and(|since| now.duration_since(since) >= TOOLBAR_TIMEOUT)
        {
            self.toolbar = None;
            self.toolbar_wall = None;
            self.mark_exit(now);
        }
        if self.selection.is_some() || self.toolbar.is_some() {
            self.exited_since = None;
            return true;
        }
        match self.exited_since {
            Some(exited) if now.duration_since(exited) >= CAPTURE_EXIT_GRACE => {
                self.exited_since = None;
                false
            }
            Some(_) => true,
            None => false,
        }
    }

    fn mark_exit(&mut self, now: Instant) {
        if self.selection.is_none()
            && self.toolbar.is_none()
            && self.exited_since.is_none()
        {
            self.exited_since = Some(now);
        }
    }
}

/// A capture session must never undo a user's explicit hide choice.
pub(crate) fn effective_visible(
    user_visible: bool,
    show_in_captures: bool,
    capture_ui_active: bool,
) -> bool {
    user_visible && (show_in_captures || !capture_ui_active)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_hides_immediately_and_restores_after_grace() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();

        guard.selection_started(started);
        assert!(guard.effective_active(started));
        assert!(!effective_visible(true, false, true));

        guard.mouse_up(started + Duration::from_millis(50));
        assert!(guard.effective_active(started + Duration::from_millis(100)));
        let active = guard.effective_active(started + CAPTURE_EXIT_GRACE + Duration::from_millis(50));
        assert!(!active);
        assert!(effective_visible(true, false, active));
    }

    #[test]
    fn escape_ends_any_session() {
        let started = Instant::now();

        let mut guard = CaptureGuard::new();
        guard.selection_started(started);
        guard.escape_pressed(started + Duration::from_millis(10));
        assert!(!guard.effective_active(started + CAPTURE_EXIT_GRACE + Duration::from_millis(20)));

        // Toolbar session restores on Esc even after clicks.
        let mut guard = CaptureGuard::new();
        guard.toolbar_started(started);
        guard.mouse_up(started + Duration::from_millis(500));
        assert!(guard.effective_active(started + Duration::from_secs(1)));
        guard.escape_pressed(started + Duration::from_secs(2));
        assert!(!guard.effective_active(started + Duration::from_secs(2) + CAPTURE_EXIT_GRACE));
    }

    #[test]
    fn toolbar_options_and_timed_capture_keep_suppression_until_explicit_exit() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();
        guard.toolbar_started(started);
        // Open Options, pick a timer, select a mode, adjust its region, Capture.
        for millis in [200, 400, 600, 800, 1000] {
            guard.mouse_up(started + Duration::from_millis(millis));
        }
        // Neither consecutive clicks nor the 5/10s countdown end the session.
        assert!(guard.effective_active(started + Duration::from_secs(3)));
        assert!(guard.effective_active(started + Duration::from_secs(11)));
        guard.escape_pressed(started + Duration::from_secs(12));
        assert!(!guard.effective_active(started + Duration::from_secs(12) + CAPTURE_EXIT_GRACE));
    }

    #[test]
    fn enter_confirms_selection_only_not_toolbar() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();

        guard.toolbar_started(started);
        guard.confirm_pressed(started + Duration::from_millis(100));
        assert!(guard.effective_active(started + Duration::from_millis(200)));

        // Selection-only case in a fresh guard (the toolbar above still holds).
        let mut guard = CaptureGuard::new();
        guard.selection_started(started + Duration::from_secs(1));
        guard.confirm_pressed(started + Duration::from_secs(2));
        assert!(!guard.effective_active(started + Duration::from_secs(2) + CAPTURE_EXIT_GRACE));
    }

    #[test]
    fn command_five_restarts_and_survives_toolbar_clicks() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();

        guard.toolbar_started(started);
        guard.mouse_up(started + Duration::from_millis(500));
        assert!(guard.effective_active(started + Duration::from_millis(600)));

        // A later ⌘⇧5 (re-opening the toolbar, also over a recording) restarts
        // the session and resets its timeout.
        guard.toolbar_started(started + Duration::from_secs(10));
        assert!(guard.effective_active(started + Duration::from_secs(13)));

        guard.stop_recording_pressed(started + Duration::from_secs(30));
        assert!(!guard.effective_active(started + Duration::from_secs(30) + CAPTURE_EXIT_GRACE));
    }

    #[test]
    fn timeouts_bound_every_session() {
        // A timeout ends the session on observation and starts the same exit
        // grace as any other end, so the next observation restores.
        let started = Instant::now();

        let mut guard = CaptureGuard::new();
        guard.selection_started(started);
        assert!(guard.effective_active(started + SELECTION_TIMEOUT));
        assert!(!guard.effective_active(started + SELECTION_TIMEOUT + CAPTURE_EXIT_GRACE));

        let mut guard = CaptureGuard::new();
        guard.toolbar_started(started);
        assert!(guard.effective_active(started + TOOLBAR_TIMEOUT));
        assert!(!guard.effective_active(started + TOOLBAR_TIMEOUT + CAPTURE_EXIT_GRACE));
    }

    #[test]
    fn reentering_during_the_exit_grace_cancels_the_restore() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();
        guard.selection_started(started);
        guard.mouse_up(started + Duration::from_millis(10));
        guard.selection_started(started + Duration::from_millis(20));

        assert!(guard.effective_active(started + CAPTURE_EXIT_GRACE + Duration::from_millis(50)));
    }

    #[test]
    fn explicit_show_cancels_any_session_without_grace() {
        let started = Instant::now();

        let mut guard = CaptureGuard::new();
        guard.toolbar_started(started);
        guard.cancel();
        assert!(!guard.effective_active(started + Duration::from_millis(1)));

        let mut guard = CaptureGuard::new();
        guard.selection_started(started);
        guard.cancel();
        assert!(!guard.effective_active(started + Duration::from_millis(1)));

        // Cancelling with no session is a no-op, not a pending restore.
        let mut guard = CaptureGuard::new();
        guard.cancel();
        assert!(!guard.effective_active(started));
    }

    #[test]
    fn toolbar_capture_file_ends_session_with_exit_grace() {
        let mut guard = CaptureGuard::new();
        let started = Instant::now();
        guard.toolbar_started(started);
        assert!(guard.toolbar_wall().is_some());

        // Toolbar option clicks and region drags are mouse-only and ignored.
        guard.mouse_up(started + Duration::from_millis(500));
        assert!(guard.effective_active(started + Duration::from_millis(600)));

        // The capture file lands: session ends, grace still hides briefly so
        // the file write finishes before overlays return.
        guard.toolbar_capture_done(started + Duration::from_secs(3));
        assert!(guard.toolbar_wall().is_none());
        assert!(guard.effective_active(started + Duration::from_secs(3) + Duration::from_millis(100)));
        assert!(!guard.effective_active(
            started + Duration::from_secs(3) + CAPTURE_EXIT_GRACE + Duration::from_millis(50)
        ));
    }

    #[test]
    fn toolbar_capture_done_without_session_is_a_no_op() {
        let mut guard = CaptureGuard::new();
        let now = Instant::now();
        guard.toolbar_capture_done(now);
        assert!(!guard.effective_active(now));
    }

    #[test]
    fn completion_scan_throttles_while_toolbar_active() {
        let mut guard = CaptureGuard::new();
        let now = Instant::now();
        assert!(!guard.completion_scan_due(now));

        guard.toolbar_started(now);
        assert!(guard.completion_scan_due(now));
        assert!(!guard.completion_scan_due(now + Duration::from_millis(400)));
        assert!(guard.completion_scan_due(now + Duration::from_millis(500)));

        guard.escape_pressed(now + Duration::from_secs(2));
        assert!(!guard.completion_scan_due(now + Duration::from_secs(4)));
    }

    #[test]
    fn toolbar_input_expedites_the_next_completion_scan_without_ending_it() {
        let mut guard = CaptureGuard::new();
        let start = Instant::now();
        guard.toolbar_started(start);
        assert!(guard.completion_scan_due(start));
        assert!(!guard.completion_scan_due(start + Duration::from_millis(100)));

        // The Capture click: session stays active, but the next scan runs
        // immediately instead of waiting out the throttle.
        guard.mouse_up(start + Duration::from_millis(200));
        assert!(guard.effective_active(start + Duration::from_millis(200)));
        assert!(guard.completion_scan_due(start + Duration::from_millis(200)));

        // Same for keyboard-driven capture from the toolbar.
        assert!(!guard.completion_scan_due(start + Duration::from_millis(300)));
        guard.confirm_pressed(start + Duration::from_millis(400));
        assert!(guard.effective_active(start + Duration::from_millis(400)));
        assert!(guard.completion_scan_due(start + Duration::from_millis(400)));
    }

    #[test]
    fn cancelling_capture_does_not_undo_manual_user_hide() {        let mut guard = CaptureGuard::new();
        let started = Instant::now();
        guard.selection_started(started);
        assert!(!effective_visible(false, false, true));

        guard.mouse_up(started + Duration::from_millis(100));
        let active = guard.effective_active(
            started + Duration::from_millis(100) + CAPTURE_EXIT_GRACE,
        );
        assert!(!active);
        assert!(!effective_visible(false, false, active));
        assert!(!effective_visible(false, true, active));
    }

    #[test]
    fn capture_opt_in_bypasses_suppression_but_respects_manual_hide() {
        let mut guard = CaptureGuard::new();
        guard.selection_started(Instant::now());

        assert!(effective_visible(true, true, true));
        assert!(!effective_visible(true, false, true));
        assert!(!effective_visible(false, true, true));
    }

    #[test]
    fn no_session_keeps_user_visibility_for_either_preference() {
        let mut guard = CaptureGuard::new();

        let active = guard.effective_active(Instant::now());
        assert!(effective_visible(true, false, active));
        assert!(effective_visible(true, true, active));
        assert!(!effective_visible(false, false, active));
        assert!(!effective_visible(false, true, active));
    }
}
