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

export function playSquishSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;

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
  filter.frequency.value = 900;
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
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(og);
  og.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}
