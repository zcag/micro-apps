let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Soft chime: two gentle sine tones */
export function playChime() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const notes = [523.25, 659.25]; // C5, E5
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0, now + i * 0.15);
    gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.8);
  }
}

// Body-doubling ambient noise nodes
let noiseSource: AudioBufferSourceNode | null = null;
let noiseGain: GainNode | null = null;

export type AmbientType = 'rain' | 'white' | 'coffee';

function createNoiseBuffer(ctx: AudioContext, type: AmbientType): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 2; // 2-second loop
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    let sample = Math.random() * 2 - 1;
    if (type === 'rain') {
      // Brown-ish noise (low-pass filtered feel) with droplet bursts
      const prev = i > 0 ? data[i - 1] : 0;
      sample = (prev + 0.02 * sample) / 1.02;
      // Occasional louder "droplets"
      if (Math.random() < 0.001) sample += (Math.random() - 0.5) * 0.3;
    } else if (type === 'coffee') {
      // Pink-ish noise (softer high frequencies)
      const prev = i > 0 ? data[i - 1] : 0;
      sample = (prev * 0.7 + sample * 0.3);
      // Occasional murmur bumps
      if (Math.random() < 0.0005) sample += (Math.random() - 0.5) * 0.2;
    }
    // 'white' uses raw random
    data[i] = sample;
  }
  return buffer;
}

export function startAmbient(type: AmbientType) {
  stopAmbient();
  const ctx = getAudioCtx();
  const buffer = createNoiseBuffer(ctx, type);
  noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;
  noiseSource.loop = true;
  noiseGain = ctx.createGain();
  noiseGain.gain.value = type === 'white' ? 0.08 : 0.15;
  noiseSource.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start();
}

export function stopAmbient() {
  if (noiseSource) {
    try { noiseSource.stop(); } catch { /* already stopped */ }
    noiseSource.disconnect();
    noiseSource = null;
  }
  if (noiseGain) {
    noiseGain.disconnect();
    noiseGain = null;
  }
}
