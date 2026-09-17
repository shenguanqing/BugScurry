/** Tiny Web Audio "啪" — no asset files needed. */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function ensureAudio(): void {
  const ac = getCtx();
  if (ac && ac.state === "suspended") void ac.resume();
}

export function playSquishSound(combo = 1): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  // Pentatonic-ish climb so a streak feels musical without assets.
  const step = Math.min(Math.max(combo, 1) - 1, 10);
  const pitchMul = 1 + step * 0.08;

  // Short noise burst
  const bufferSize = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const decay = 1 - i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900 * pitchMul;
  filter.Q.value = 0.7;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  noise.start(t);
  noise.stop(t + 0.14);

  // Soft thump
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160 * pitchMul, t);
  osc.frequency.exponentialRampToValueAtTime(60 * pitchMul, t + 0.1);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(og);
  og.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

/** Broad hiss for the insecticide spray. */
export function playSprayHiss(): (() => void) | undefined {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const duration = 0.45;
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.sin((i / bufferSize) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  noise.start(t);
  noise.stop(t + duration + 0.02);
  const disconnect = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  noise.onended = disconnect;
  return () => { noise.stop(); disconnect(); };
}

/** Dull thud for chipping a fat bug. */
export function playHurtSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.07);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}
