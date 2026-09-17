import { afterEach, describe, expect, it, vi } from "vitest";
import { createRainTexture, createWindTexture } from "../rainTexture";
import { Rng } from "../rng";
import { DEFAULT_SETTINGS } from "../config";
import { disposeRainAudio, stopRainAudio, tickRainAudio } from "../rainAudio";

function rms(data: Float32Array): number {
  return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
}

describe("rain textures", () => {
  it("produces finite, unclipped stereo textures at supported sample rates", () => {
    for (const rate of [22050, 24000, 44100, 48000]) {
      for (const layer of ["bed", "drops", "spray"] as const) {
        const rng = new Rng(91);
        const channels = createRainTexture(rate, 2, layer, () => rng.next());
        for (const data of channels) {
          expect(data.length).toBe(rate * 2);
          expect(data.every((v) => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
          expect(rms(data)).toBeGreaterThan(0.001);
          expect(Math.abs(data.reduce((a, b) => a + b, 0) / data.length)).toBeLessThan(0.015);
        }
        expect(channels[0]).not.toEqual(channels[1]);
      }
    }
  });

  it("makes the spray denser than the individual impacts", () => {
    const occupancy = (layer: "drops" | "spray") => {
      const rng = new Rng(17);
      const [data] = createRainTexture(24000, 4, layer, () => rng.next());
      return data.filter((v) => Math.abs(v) > 0.0001).length / data.length;
    };
    expect(occupancy("spray")).toBeGreaterThan(occupancy("drops") * 1.4);
  });

  it("does not introduce an outlier impulse at the bed loop seam", () => {
    const rng = new Rng(53);
    for (const data of createRainTexture(24000, 3, "bed", () => rng.next())) {
      let maxStep = 0;
      for (let i = 1; i < data.length; i++) maxStep = Math.max(maxStep, Math.abs(data[i] - data[i - 1]));
      expect(Math.abs(data[0] - data[data.length - 1])).toBeLessThan(maxStep);
    }
  });
});

function audioHarness() {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const sources: ReturnType<typeof source>[] = [];
  const gains: ReturnType<typeof gain>[] = [];
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), buffer: null, loop: false });
  const gain = () => ({ ...node(), gain: param() });
  class Context {
    sampleRate = 24000;
    currentTime = 1;
    state = "running";
    destination = {};
    close = vi.fn().mockResolvedValue(undefined);
    createBuffer(_channels: number, length: number) {
      const data = [new Float32Array(length), new Float32Array(length)];
      return { getChannelData: (channel: number) => data[channel] };
    }
    createBufferSource() { const value = source(); sources.push(value); return value; }
    createGain() { const value = gain(); gains.push(value); return value; }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: param(), type: "" }; }
  }
  vi.stubGlobal("window", { AudioContext: Context });
  return { sources, gains };
}

afterEach(() => {
  disposeRainAudio();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rain playback lifecycle", () => {
  it("only schedules mix changes and reuses sources across intensity changes", () => {
    const { sources, gains } = audioHarness();
    const settings = { ...DEFAULT_SETTINGS, sound: true, rain: true, rainKind: "light" as const };
    tickRainAudio(settings, 0);
    for (let i = 0; i < 120; i++) tickRainAudio(settings, i / 60);
    expect(sources).toHaveLength(3);
    expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledTimes(1);
    tickRainAudio({ ...settings, rainKind: "downpour" }, 3);
    expect(sources).toHaveLength(3);
    expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending stop when restarted, then releases sources while hidden", () => {
    vi.useFakeTimers();
    const { sources } = audioHarness();
    const settings = { ...DEFAULT_SETTINGS, sound: true, rain: true, rainKind: "heavy" as const };
    tickRainAudio(settings, 0);
    stopRainAudio();
    vi.advanceTimersByTime(40);
    tickRainAudio(settings, 1);
    vi.advanceTimersByTime(150);
    expect(sources.every((source) => source.stop.mock.calls.length === 0)).toBe(true);
    tickRainAudio(settings, 2, false);
    vi.advanceTimersByTime(150);
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    tickRainAudio(settings, 3);
    expect(sources).toHaveLength(6);
  });
});


describe("dry weather audio", () => {
  it("keeps fog silent and releases the previous weather sources", () => {
    vi.useFakeTimers();
    const { sources } = audioHarness();
    const settings = { ...DEFAULT_SETTINGS, sound: true, rain: true, rainKind: "fog" as const };
    tickRainAudio(settings, 0);
    expect(sources).toHaveLength(0);
    tickRainAudio({ ...settings, rainKind: "sand" }, 1);
    expect(sources).toHaveLength(2);
    tickRainAudio(settings, 2);
    vi.advanceTimersByTime(150);
    expect(sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
  });

  it("crossfades water layers out for sand and dry layers out for rain", () => {
    const { sources, gains } = audioHarness();
    const settings = { ...DEFAULT_SETTINGS, sound: true, rain: true, rainKind: "heavy" as const };
    tickRainAudio(settings, 0);
    tickRainAudio({ ...settings, rainKind: "sand" }, 1);
    expect(sources).toHaveLength(5);
    for (const g of gains.slice(1, 4)) expect(g.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.6);
    expect(gains[4].gain.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(0.1);
    tickRainAudio(settings, 2);
    for (const g of gains.slice(4)) expect(g.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.6);
    expect(sources).toHaveLength(5);
  });

  it("builds unclipped continuous stereo wind with a softer spectrum than grit", () => {
    for (const rate of [22050, 48000]) {
      const roughness: number[] = [];
      for (const layer of ["wind", "grit"] as const) {
        const rng = new Rng(42);
        const channels = createWindTexture(rate, 3, layer, () => rng.next());
        expect(channels[0]).not.toEqual(channels[1]);
        for (const data of channels) {
          expect(data.every((v) => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
          expect(rms(data)).toBeGreaterThan(0.01);
          let stepEnergy = 0;
          let maxStep = 0;
          for (let i = 1; i < data.length; i++) {
            const step = data[i] - data[i - 1];
            stepEnergy += step * step;
            maxStep = Math.max(maxStep, Math.abs(step));
          }
          expect(Math.abs(data[0] - data[data.length - 1])).toBeLessThan(maxStep);
          roughness.push(Math.sqrt(stepEnergy / data.length) / rms(data));
        }
      }
      expect(roughness[0]).toBeLessThan(roughness[2] * 0.7);
    }
  });
});
