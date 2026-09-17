import { DEFAULT_SETTINGS } from "../core/config";
import { drawLightning, drawWeather } from "../core/renderer";
import { disposeRainAudio, stopRainAudio, tickRainAudio } from "../core/rainAudio";
import { RAIN_KIND_ORDER } from "../core/weather";
import type { RainKind, Viewport } from "../core/types";
import { t } from "../i18n";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initWeatherQa() {
  const menu = element<HTMLDivElement>("weather-menu");
  const wind = element<HTMLInputElement>("wind");
  const sound = element<HTMLInputElement>("weather-sound");
  const seek = element<HTMLInputElement>("seek-weather");
  const pause = element<HTMLButtonElement>("pause-weather");
  const background = element<HTMLSelectElement>("background");
  const settings = { ...DEFAULT_SETTINGS, rain: true, sound: false, rainWind: 0.5 };
  const requested = new URLSearchParams(location.search).get("kind");
  let kind: RainKind | null = RAIN_KIND_ORDER.find((value) => value === requested) ?? "light";
  let active = false;
  let paused = false;
  let time = 0;
  let lastReadout = -1;
  const scenes = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]")).map((container) => {
    const canvas = container.querySelector("canvas")!;
    return { container, canvas, ctx: canvas.getContext("2d")!, viewport: { width: 0, height: 0, dpr: 1 } };
  });

  function resize() {
    for (const scene of scenes) {
      if (scene.container.hidden) continue;
      const width = scene.canvas.clientWidth;
      const height = scene.canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (width <= 0 || height <= 0) continue;
      scene.viewport = { width, height, dpr };
      if (scene.canvas.width !== Math.round(width * dpr) || scene.canvas.height !== Math.round(height * dpr)) {
        scene.canvas.width = Math.round(width * dpr);
        scene.canvas.height = Math.round(height * dpr);
      }
    }
  }
  const observer = new ResizeObserver(resize);
  for (const scene of scenes) observer.observe(scene.canvas);

  function updateControls() {
    for (const button of Array.from(menu.querySelectorAll("button"))) button.setAttribute("aria-pressed", String(button.dataset.kind === kind));
    element("weather-title").textContent = kind ? t(`tray.rain.${kind}`) : "晴天 / 无天气";
    element("wind-value").textContent = `${settings.rainWind < 0 ? "←" : settings.rainWind > 0 ? "→" : "无偏向"} ${Math.abs(settings.rainWind).toFixed(2)}`;
    element("sound-note").textContent = kind === "fog" ? "雾本身没有声音；开启声音也保持安静。"
      : kind === "thunder" ? "雷雨含闪电与延迟雷声，开启声音后同步试听。" : "声音默认关闭，只影响本页预览。";
    pause.textContent = paused ? "继续播放" : "暂停";
    pause.setAttribute("aria-pressed", String(paused));
    lastReadout = -1;
  }

  function choose(next: RainKind | null) {
    stopRainAudio();
    kind = next;
    time = 0;
    paused = false;
    const url = new URL(location.href);
    if (kind) url.searchParams.set("kind", kind);
    else url.searchParams.delete("kind");
    history.replaceState(null, "", url);
    updateControls();
  }
  for (const value of RAIN_KIND_ORDER) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.kind = value;
    button.textContent = t(`tray.rain.${value}`);
    button.onclick = () => choose(value);
    menu.append(button);
  }
  element("random-weather").onclick = () => choose(RAIN_KIND_ORDER[Math.floor(Math.random() * RAIN_KIND_ORDER.length)]);
  element("stop-weather").onclick = () => choose(null);
  wind.oninput = () => { settings.rainWind = Number(wind.value); updateControls(); };
  sound.onchange = () => {
    settings.sound = sound.checked;
    if (!sound.checked) stopRainAudio();
    // Called from the user gesture so AudioContext can unlock in browser/WebView.
    if (active && !paused && kind) tickRainAudio({ ...settings, rainKind: kind }, time);
    updateControls();
  };
  pause.onclick = () => { paused = !paused; if (paused) stopRainAudio(); updateControls(); };
  element("reset-weather").onclick = () => { time = 0; paused = false; stopRainAudio(); updateControls(); };
  element("step-weather").onclick = () => { paused = true; time += 1 / 60; stopRainAudio(); updateControls(); };
  seek.oninput = () => { time = Number(seek.value); paused = true; stopRainAudio(); updateControls(); };
  background.onchange = () => {
    for (const scene of scenes) scene.container.hidden = background.value !== "split" && background.value !== scene.container.dataset.scene;
    element("weather-scenes").classList.toggle("single", background.value !== "split");
    resize();
  };

  function frame(dt: number) {
    if (!active) return;
    if (!paused) time += dt;
    if (scenes.some((scene) => scene.viewport.dpr !== window.devicePixelRatio)) resize();
    for (const { canvas, ctx, viewport, container } of scenes) {
      if (container.hidden || viewport.width <= 0) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      if (kind) {
        drawWeather(ctx, viewport, time, kind, settings.rainWind);
        if (kind === "thunder") drawLightning(ctx, viewport, time);
      }
    }
    if (kind && !paused) tickRainAudio({ ...settings, rainKind: kind }, time);
    if (lastReadout < 0 || Math.abs(time - lastReadout) >= 0.1) {
      element("weather-time").textContent = `${time.toFixed(2)} s`;
      seek.max = String(Math.max(60, Math.ceil(time)));
      seek.value = String(time);
      element("weather-status").textContent = `${paused ? "已暂停" : "播放中"} · ${sound.checked && !paused && kind && kind !== "fog" ? "声音已开" : "静音"}`;
      lastReadout = time;
    }
  }
  updateControls();
  runWeatherChecks();
  return {
    frame,
    setActive(value: boolean) { active = value; if (!value) stopRainAudio(); else { resize(); frame(0); } },
    dispose() { observer.disconnect(); disposeRainAudio(); },
  };
}

function runWeatherChecks() {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const viewport: Viewport = { width: 480, height: 270, dpr: 1 };
  const output = element("weather-checks");
  output.textContent = "";
  for (const kind of RAIN_KIND_ORDER) {
    let ok = true;
    let previous: Uint8ClampedArray | undefined;
    let changed = false;
    let error = "";
    try {
      for (const time of [0, 1.5, 3, 8]) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawWeather(ctx, viewport, time, kind, -0.6);
        if (kind === "thunder") drawLightning(ctx, viewport, time);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        ok &&= pixels.some((v, index) => index % 4 === 3 && v > 0);
        if (previous) changed ||= pixels.some((v, index) => v !== previous![index]);
        previous = pixels;
        const matrix = ctx.getTransform();
        ok &&= matrix.isIdentity && ctx.globalAlpha === 1 && ctx.globalCompositeOperation === "source-over";
      }
    } catch (cause) { ok = false; error = String(cause); }
    const line = document.createElement("span");
    line.className = ok && changed ? "pass" : "fail";
    line.textContent = `${ok && changed ? "PASS" : "FAIL"}  ${t(`tray.rain.${kind}`)} · 4 帧 / 有像素 / 动画变化 / 状态恢复 ${error}\n`;
    output.append(line);
  }
}
