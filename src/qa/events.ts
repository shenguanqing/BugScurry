import { BugManager } from "../core/bugManager";
import { DEFAULT_SETTINGS, EVENT_BANNER } from "../core/config";
import { ensureAudio, playSprayHiss } from "../core/audio";
import { updateBugs } from "../core/movement";
import { render } from "../core/renderer";
import { applyRandomEventToManager, eventBannerMs, RANDOM_EVENT_KINDS } from "../core/randomEvents";
import type { RandomEventKind, Viewport } from "../core/types";
import { t } from "../i18n";

export function initEventsQa() {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = el<HTMLCanvasElement>("event-canvas");
  const ctx = canvas.getContext("2d")!;
  const banner = el("event-banner");
  const sound = el<HTMLInputElement>("event-sound");
  const pause = el<HTMLButtonElement>("event-pause");
  const settings = { ...DEFAULT_SETTINGS, count: 12, species: "random", rain: false, sound: false, repellent: false };
  let viewport: Viewport = { width: 900, height: 500, dpr: 1 };
  let manager = new BugManager(settings, viewport);
  let now = 0;
  let active = false;
  let paused = false;
  let pending: { kind: RandomEventKind; start: number } | null = null;
  let stopSound: (() => void) | undefined;
  let readout = -1;
  function silence() { stopSound?.(); stopSound = undefined; }
  function resize() {
    if (canvas.clientWidth <= 0) return;
    viewport = { width: canvas.clientWidth, height: canvas.clientHeight, dpr: devicePixelRatio || 1 };
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    manager.setViewport(viewport);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function setPaused(value: boolean) {
    paused = value;
    pause.textContent = value ? "继续模拟" : "暂停模拟";
    pause.setAttribute("aria-pressed", String(value));
    if (value) silence();
    readout = -1;
  }
  function reset() {
    silence();
    now = 0;
    pending = null;
    banner.hidden = true;
    manager = new BugManager(settings, viewport);
    setPaused(false);
    el("event-title").textContent = "事件沙盒";
    el("event-description").textContent = "选择左侧事件查看效果，或直接测试杀虫喷雾。";
  }
  for (const kind of RANDOM_EVENT_KINDS) {
    const button = document.createElement("button");
    button.textContent = t(`event.${kind}.title`);
    button.dataset.event = kind;
    button.onclick = () => {
      reset();
      el("event-title").textContent = t(`event.${kind}.title`);
      el("event-description").textContent = t(`event.${kind}.subtitle`);
      if (el<HTMLInputElement>("event-announce").checked) {
        pending = { kind, start: now };
        el("event-banner-title").textContent = t(`event.${kind}.title`);
        el("event-banner-sub").textContent = t(`event.${kind}.subtitle`);
        banner.style.opacity = "1";
        banner.hidden = false;
      } else applyRandomEventToManager(manager, kind, now);
    };
    el("event-menu").append(button);
  }
  el("event-spray").onclick = () => {
    pending = null;
    banner.hidden = true;
    setPaused(false);
    const killed = manager.sprayKillAll(now).length;
    el("event-description").textContent = `喷雾命中 ${killed} 只虫。点击“重置场景”可重新测试。`;
    silence();
    if (sound.checked) { ensureAudio(); stopSound = playSprayHiss(); }
  };
  sound.onchange = () => { if (!sound.checked) silence(); };
  el("event-reset").onclick = reset;
  pause.onclick = () => setPaused(!paused);

  function frame(dt: number) {
    if (!active) return;
    if (viewport.dpr !== devicePixelRatio) resize();
    if (!paused) {
      now += dt * 1000;
      if (pending) {
        const elapsed = now - pending.start;
        banner.style.opacity = String(Math.max(0, 1 - Math.max(0, elapsed - EVENT_BANNER.showMs) / EVENT_BANNER.hideMs));
        if (elapsed >= eventBannerMs()) {
          applyRandomEventToManager(manager, pending.kind, now);
          pending = null;
          banner.hidden = true;
        }
      }
      updateBugs(manager.list, dt, settings, viewport);
      manager.tick(dt, now);
    }
    render(ctx, manager.list, manager.stainList, manager.particleList, manager.baitList, manager.floatList, viewport, false, now / 1000, manager.sprayFxProgress);
    if (readout < 0 || now - readout >= 100) {
      const live = manager.list.filter((bug) => bug.state === "crawling" || bug.state === "paused").length;
      el("event-status").textContent = `${paused ? "已暂停" : pending ? "事件预告" : "运行中"} · 存活 ${live} · ${(now / 1000).toFixed(1)} s`;
      readout = now;
    }
  }
  return {
    frame,
    setActive(value: boolean) { active = value; if (!value) silence(); else { resize(); frame(0); } },
    dispose() { silence(); observer.disconnect(); },
  };
}
