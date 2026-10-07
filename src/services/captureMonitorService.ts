import {
  getCaptureMonitorStatus,
  openSystemSettingsPane,
  requestCaptureInputMonitoring,
  type CaptureMonitorStatus,
} from "./tauriBridge";

/** Readiness comes from the installed listener, through either permission path. */
export function isCaptureCompatibilityReady(status: CaptureMonitorStatus | null): boolean {
  return !!status?.supported && status.listening;
}

export function shouldPollCaptureStatus(status: CaptureMonitorStatus, showInCaptures: boolean): boolean {
  if (!status.supported) return false;
  if (status.listening && (!status.accessibility || status.canRecord)) return false;
  // An Accessibility-only listener can still be starting while inclusion is on.
  return !showInCaptures || status.authorized || status.accessibility;
}

/** A denied/repeated permission request may show no prompt; provide a real entry point. */
export async function enableCaptureCompatibility(): Promise<CaptureMonitorStatus> {
  await requestCaptureInputMonitoring();
  // The one-time system alert is asynchronous and our own Settings pane would
  // cover it: re-check before falling back to the manual entry. If the user
  // allowed via the alert, no pane opens at all.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const status = await getCaptureMonitorStatus();
  if (status.supported && !status.authorized && !status.accessibility) {
    await openSystemSettingsPane("input-monitoring");
  }
  return status;
}
