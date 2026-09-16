import { MAX_DT } from "./config";
import type { BugManager } from "./bugManager";
import { updateBugs } from "./movement";
import { render } from "./renderer";
import type { CursorState, Settings, Viewport } from "./types";

export interface LoopHooks {
  manager: BugManager;
  getSettings: () => Settings;
  getViewport: () => Viewport;
  getCanvas: () => HTMLCanvasElement | null;
  getCursor: () => CursorState;
  /** Primary-overlay frame hook (rain audio, thunder sync). */
  onFrame?: (timeSec: number, settings: Settings, visible: boolean) => void;
}

export function createLoop(hooks: LoopHooks) {
  let rafId = 0;
  let last = performance.now();
  let running = false;

  const frame = (t: number) => {
    if (!running) return;
    const rawDt = (t - last) / 1000;
    const dt = Math.min(MAX_DT, Math.max(0, rawDt));
    last = t;

    try {
      const viewport = hooks.getViewport();
      const settings = hooks.getSettings();
      const manager = hooks.manager;
      const cursor = hooks.getCursor();
      const show = manager.isVisible;

      hooks.onFrame?.(t / 1000, settings, show);

      if (show) {
        updateBugs(
          manager.list,
          dt,
          settings,
          viewport,
          cursor,
          manager.baitList,
        );
        manager.tick(dt);

        const canvas = hooks.getCanvas();
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            render(
              ctx,
              manager.list,
              manager.stainList,
              manager.particleList,
              manager.baitList,
              manager.floatList,
              viewport,
              settings.rain
                ? { kind: settings.rainKind, wind: settings.rainWind }
                : false,
              t / 1000,
            );
          }
        }
      }
    } catch (err) {
      console.error("frame error", err);
    }

    rafId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}