import type { RainKind, Settings } from "./types";
import { lightningFlash } from "./weather";

import { createRainTexture, type RainLayer } from "./rainTexture";

interface RainMix {
  gain: number;
  low: number;
  high: number;
  drops: number;
  spray: number;
}

/** Light rain exposes individual impacts; heavier rain fills in the wash. */
export const RAIN_AUDIO_MIX: Record<RainKind, RainMix> = {
  light: { gain: 0.025, low: 6500, high: 500, drops: 0.22, spray: 0.015 },
  moderate: { gain: 0.065, low: 7200, high: 280, drops: 0.28, spray: 0.15 },
  heavy: { gain: 0.12, low: 7800, high: 150, drops: 0.3, spray: 0.32 },
  downpour: { gain: 0.19, low: 8500, high: 90, drops: 0.26, spray: 0.48 },
  thunder: { gain: 0.14, low: 7400, high: 120, drops: 0.28, spray: 0.36 },
};

type Ctx = AudioContext;
interface TextureVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}
let ctx: Ctx | null = null;
const voices = new Map<RainLayer, TextureVoice>();
const buffers = new Map<RainLayer, AudioBuffer>();
let highpass: BiquadFilterNode | null = null;
let lowpass: BiquadFilterNode | null = null;
let master: GainNode | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
/** One-shot thunder voices; killed the moment rain stops. */
const oneShots = new Map<AudioBufferSourceNode, AudioNode[]>();
let activeKind: RainKind | null = null;
let lastFlash = 0;
let thunderUntil = -1;
let rainingAudibly = false;

function getCtx(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function releaseBed(): void {
  for (const { source, gain } of voices.values()) {
    source.stop();
    source.disconnect();
    gain.disconnect();
  }
  voices.clear();
  highpass?.disconnect();
  lowpass?.disconnect();
  master?.disconnect();
  highpass = null;
  lowpass = null;
  master = null;
}

function ensureBed(): Ctx | null {
  const ac = getCtx();
  if (!ac) return null;
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (!voices.size) {
    highpass = ac.createBiquadFilter();
    highpass.type = "highpass";
    highpass.Q.value = 0.5;
    lowpass = ac.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.Q.value = 0.5;
    master = ac.createGain();
    master.gain.value = 0;
    highpass.connect(lowpass);
    lowpass.connect(master);
    master.connect(ac.destination);
    const layers: [RainLayer, number][] = [["bed", 11], ["drops", 13], ["spray", 17]];
    for (const [layer, seconds] of layers) {
      let buffer = buffers.get(layer);
      if (!buffer) {
        // 24 kHz is sufficient for these textures and bounds memory / startup cost.
        const sampleRate = Math.min(ac.sampleRate, 24000);
        const channels = createRainTexture(sampleRate, seconds, layer);
        buffer = ac.createBuffer(2, channels[0].length, sampleRate);
        buffer.getChannelData(0).set(channels[0]);
        buffer.getChannelData(1).set(channels[1]);
        buffers.set(layer, buffer);
      }
      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ac.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(highpass);
      source.start(0, Math.random() * seconds);
      voices.set(layer, { source, gain });
    }
  }
  if (ac.state === "suspended") void ac.resume().catch(() => { /* retry on next mix change */ });
  return ac;
}

function trackOneShot(src: AudioBufferSourceNode, nodes: AudioNode[]): void {
  oneShots.set(src, nodes);
  src.onended = () => {
    src.disconnect();
    for (const node of nodes) node.disconnect();
    oneShots.delete(src);
  };
}

/** Fade rapidly, then stop all looping sources even if the render loop is hidden. */
function muteRainNow(): void {
  if (ctx && master) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.08);
    if (releaseTimer !== null) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseBed();
      releaseTimer = null;
    }, 100);
  }
  for (const [src, nodes] of oneShots) {
    src.stop();
    src.disconnect();
    for (const node of nodes) node.disconnect();
  }
  oneShots.clear();
  thunderUntil = -1;
}

function fract(n: number): number {
  return n - Math.floor(n);
}

/**
 * Thunder, not a firecracker.
 * Most strikes are distant: the flash is silent, then a delayed low rolling
 * body arrives a beat later. A minority are close: a short dark tear (not a
 * high papery snap) plus an immediate, fatter roll.
 */
function playThunder(ac: Ctx, timeSec: number): number {
  const t0 = ac.currentTime;
  const seed = fract(timeSec * 12.9898 + 0.17);
  const close = seed < 0.22;
  // Distant lag matches how we hear real storms; close hits almost with the flash.
  const delay = close ? 0.03 + fract(seed * 3.7) * 0.1 : 0.55 + fract(seed * 7.3) * 1.35;
  const duration = close
    ? 2.6 + fract(seed * 3.1) * 1.1
    : 3.0 + fract(seed * 5.7) * 1.6;
  const start = t0 + delay;

  const len = Math.floor(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);

  // Rolling body: brown noise with 2–4 swells so it "walks" across the sky.
  let veryLow = 0;
  let body = 0;
  const nPeaks = 2 + Math.floor(fract(seed * 11.7) * 3);
  const peaks: number[] = [];
  for (let p = 0; p < nPeaks; p++) {
    peaks.push(0.1 + ((p + fract(seed * (13 + p * 2))) / nPeaks) * 0.72);
  }

  for (let i = 0; i < len; i++) {
    const u = i / len;
    const white = Math.random() * 2 - 1;
    veryLow = veryLow * 0.9975 + white * 0.0025;
    body = body * 0.972 + white * 0.028;

    let env = 0;
    for (const p of peaks) {
      const d = u - p;
      if (d < -0.04) continue;
      const rise = d < 0 ? (d + 0.04) / 0.04 : 1;
      const fall = Math.exp(-Math.max(0, d) * (3.2 + nPeaks * 0.6));
      env = Math.max(env, rise * fall);
    }
    // Soft edges so the one-shot buffer never clicks.
    env *= Math.min(1, u / 0.015) * Math.min(1, (1 - u) / 0.07);
    data[i] = (veryLow * 22 + body * 3.5) * env;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;

  const lowpass = ac.createBiquadFilter();
  lowpass.type = "lowpass";
  // Distant thunder is darker; close has a touch more chest.
  lowpass.frequency.value = close ? 150 : 105;
  lowpass.Q.value = 0.65;

  const chest = ac.createBiquadFilter();
  chest.type = "peaking";
  chest.frequency.value = 70;
  chest.Q.value = 0.9;
  chest.gain.value = close ? 5 : 3;

  const gain = ac.createGain();
  const peakGain = close ? 0.38 : 0.26;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.07);
  gain.gain.setTargetAtTime(0.0001, start + duration * 0.5, duration * 0.28);

  src.connect(lowpass);
  lowpass.connect(chest);
  chest.connect(gain);
  gain.connect(ac.destination);
  trackOneShot(src, [lowpass, chest, gain]);
  src.start(start);
  src.stop(start + duration + 0.12);

  // Close strikes: a short dark tear right at the flash — full-band, not a snap.
  if (close) {
    const tearLen = Math.floor(ac.sampleRate * 0.1);
    const tearBuf = ac.createBuffer(1, tearLen, ac.sampleRate);
    const td = tearBuf.getChannelData(0);
    for (let i = 0; i < tearLen; i++) {
      const decay = 1 - i / tearLen;
      td[i] = (Math.random() * 2 - 1) * Math.pow(decay, 1.5);
    }
    const tear = ac.createBufferSource();
    tear.buffer = tearBuf;
    const tearFilter = ac.createBiquadFilter();
    tearFilter.type = "lowpass";
    tearFilter.frequency.value = 850;
    tearFilter.Q.value = 0.45;
    const tearGain = ac.createGain();
    tearGain.gain.setValueAtTime(0.0001, t0);
    tearGain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.004);
    tearGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    tear.connect(tearFilter);
    tearFilter.connect(tearGain);
    tearGain.connect(ac.destination);
    trackOneShot(tear, [tearFilter, tearGain]);
    tear.start(t0);
    tear.stop(t0 + 0.15);
  }

  // Keep the next strike from stacking on top of this roll.
  return delay + duration * 0.85;
}

/**
 * Called every visible frame from the primary overlay.
 * `audible` is false while bugs are hidden so ambience fades out with the scene.
 */
export function tickRainAudio(settings: Settings, timeSec: number, audible = true): void {
  if (!settings.rain || !settings.sound || !audible) {
    if (rainingAudibly) {
      rainingAudibly = false;
      muteRainNow();
    }
    activeKind = null;
    lastFlash = 0;
    return;
  }
  rainingAudibly = true;

  const ac = activeKind === settings.rainKind ? ctx : ensureBed();
  if (!ac || !lowpass || !highpass || !master) return;
  // Sleep/wake can leave the context suspended without tearing the bed down.
  if (ac.state === "suspended") void ac.resume().catch(() => { /* next tick retries */ });

  const mix = RAIN_AUDIO_MIX[settings.rainKind];
  if (activeKind !== settings.rainKind) {
    activeKind = settings.rainKind;
    const now = ac.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(1, now, 0.25);
    voices.get("bed")?.gain.gain.setTargetAtTime(mix.gain, now, 0.6);
    voices.get("drops")?.gain.gain.setTargetAtTime(mix.drops, now, 0.6);
    voices.get("spray")?.gain.gain.setTargetAtTime(mix.spray, now, 0.6);
    lowpass.frequency.setTargetAtTime(mix.low, ac.currentTime, 0.2);
    highpass.frequency.setTargetAtTime(mix.high, ac.currentTime, 0.2);
  }

  if (settings.rainKind === "thunder") {
    const flash = lightningFlash(timeSec);
    const rising = flash > 0.5 && lastFlash <= 0.5;
    lastFlash = flash;
    if (rising && timeSec > thunderUntil) {
      const span = playThunder(ac, timeSec);
      thunderUntil = timeSec + span;
    }
  } else {
    lastFlash = 0;
  }
}

/** Immediate silence (tray stop-rain, sound off, hide). Safe to call anytime. */
export function stopRainAudio(): void {
  muteRainNow();
  rainingAudibly = false;
  activeKind = null;
  lastFlash = 0;
}

/** Tear down the looping bed (tests / hot reload). */
export function disposeRainAudio(): void {
  muteRainNow();
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  releaseTimer = null;
  releaseBed();
  buffers.clear();
  if (ctx) void ctx.close().catch(() => {});
  ctx = null;
  activeKind = null;
  lastFlash = 0;
  thunderUntil = -1;
  rainingAudibly = false;
}
