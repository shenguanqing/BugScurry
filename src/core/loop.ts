import { MAX_DT } from "./config";
import type { BugManager } from "./bugManager";
import { updateBugs } from "./movement";
import { render } from "./renderer";
import type { Settings, Viewport } from "./types";

export interface LoopHooks {
  manager: BugManager;
  getSettings: () => Settings;
  getViewport: () => Viewport;
  getCanvas: () => HTMLCanvasElement | null;
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

    const viewport = hooks.getViewport();
    const settings = hooks.getSettings();
    const manager = hooks.manager;

    if (manager.isVisible) {
      updateBugs(manager.list, dt, settings, viewport);
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
            viewport,
          );
        }
      }
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
