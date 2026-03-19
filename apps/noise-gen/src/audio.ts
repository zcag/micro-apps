// Web Audio API noise and nature sound generators

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function getAnalyserNode(): AnalyserNode | null {
  if (!audioCtx) return null;
  if (!(globalAnalyser as AnalyserNode | null)) return null;
  return globalAnalyser;
}

let globalAnalyser: AnalyserNode | null = null;
let masterGain: GainNode | null = null;

function getMasterChain() {
  const ctx = getContext();
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    globalAnalyser = ctx.createAnalyser();
    globalAnalyser.fftSize = 256;
    masterGain.connect(globalAnalyser);
    globalAnalyser.connect(ctx.destination);
  }
  return { masterGain, analyser: globalAnalyser, ctx };
}

export function setMasterVolume(v: number) {
  if (masterGain) {
    masterGain.gain.setTargetAtTime(v, masterGain.context.currentTime, 0.02);
  }
}

export type SoundId = 'white' | 'pink' | 'brown' | 'rain' | 'ocean' | 'forest' | 'fire';

interface ActiveSound {
  nodes: AudioNode[];
  gain: GainNode;
  stop: () => void;
}

const activeSounds = new Map<SoundId, ActiveSound>();

export function isSoundActive(id: SoundId): boolean {
  return activeSounds.has(id);
}

export function setSoundVolume(id: SoundId, v: number) {
  const s = activeSounds.get(id);
  if (s) {
    s.gain.gain.setTargetAtTime(v, s.gain.context.currentTime, 0.02);
  }
}

export function startSound(id: SoundId, volume: number) {
  if (activeSounds.has(id)) return;
  const { masterGain: master, ctx } = getMasterChain();

  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(master);

  let nodes: AudioNode[];
  let stop: () => void;

  switch (id) {
    case 'white':
      ({ nodes, stop } = createWhiteNoise(ctx, gain));
      break;
    case 'pink':
      ({ nodes, stop } = createPinkNoise(ctx, gain));
      break;
    case 'brown':
      ({ nodes, stop } = createBrownNoise(ctx, gain));
      break;
    case 'rain':
      ({ nodes, stop } = createRain(ctx, gain));
      break;
    case 'ocean':
      ({ nodes, stop } = createOcean(ctx, gain));
      break;
    case 'forest':
      ({ nodes, stop } = createForest(ctx, gain));
      break;
    case 'fire':
      ({ nodes, stop } = createFire(ctx, gain));
      break;
  }

  activeSounds.set(id, { nodes, gain, stop });
}

export function stopSound(id: SoundId) {
  const s = activeSounds.get(id);
  if (s) {
    s.stop();
    s.gain.disconnect();
    activeSounds.delete(id);
  }
}

export function stopAll() {
  for (const id of Array.from(activeSounds.keys())) {
    stopSound(id);
  }
}

export function isAnySoundActive(): boolean {
  return activeSounds.size > 0;
}

// ── White Noise ──
function createWhiteNoise(ctx: AudioContext, dest: AudioNode) {
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(dest);
  source.start();
  return { nodes: [source], stop: () => source.stop() };
}

// ── Pink Noise (Voss-McCartney approximation via biquad) ──
function createPinkNoise(ctx: AudioContext, dest: AudioNode) {
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Paul Kellet's refined method
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(dest);
  source.start();
  return { nodes: [source], stop: () => source.stop() };
}

// ── Brown Noise (integrated white noise) ──
function createBrownNoise(ctx: AudioContext, dest: AudioNode) {
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(dest);
  source.start();
  return { nodes: [source], stop: () => source.stop() };
}

// ── Rain (filtered noise bursts) ──
function createRain(ctx: AudioContext, dest: AudioNode) {
  // Base rain: filtered white noise
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 1000;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 8000;

  // Slow LFO to modulate volume (rain intensity variation)
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.8;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.2;
  lfo.connect(lfoDepth);
  lfoDepth.connect(lfoGain.gain);
  lfo.start();

  source.connect(hpf);
  hpf.connect(lpf);
  lpf.connect(lfoGain);
  lfoGain.connect(dest);

  return {
    nodes: [source, hpf, lpf, lfo, lfoDepth, lfoGain],
    stop: () => { source.stop(); lfo.stop(); },
  };
}

// ── Ocean (layered filtered noise with rhythmic modulation) ──
function createOcean(ctx: AudioContext, dest: AudioNode) {
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Low-pass for deep ocean sound
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 600;
  lpf.Q.value = 0.5;

  // Wave rhythm LFO
  const waveLfo = ctx.createOscillator();
  waveLfo.frequency.value = 0.08; // slow wave rhythm
  const waveDepth = ctx.createGain();
  waveDepth.gain.value = 400;
  waveLfo.connect(waveDepth);
  waveDepth.connect(lpf.frequency);
  waveLfo.start();

  // Volume modulation for wave crashing
  const volGain = ctx.createGain();
  volGain.gain.value = 0.6;
  const volLfo = ctx.createOscillator();
  volLfo.frequency.value = 0.1;
  const volDepth = ctx.createGain();
  volDepth.gain.value = 0.4;
  volLfo.connect(volDepth);
  volDepth.connect(volGain.gain);
  volLfo.start();

  source.connect(lpf);
  lpf.connect(volGain);
  volGain.connect(dest);

  return {
    nodes: [source, lpf, waveLfo, waveDepth, volGain, volLfo, volDepth],
    stop: () => { source.stop(); waveLfo.stop(); volLfo.stop(); },
  };
}

// ── Forest (layered oscillators mimicking birds and rustling) ──
function createForest(ctx: AudioContext, dest: AudioNode) {
  const allOsc: OscillatorNode[] = [];

  // Wind rustling: filtered noise
  const windBuf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
  const windData = windBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < windData.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    windData[i] = last * 2;
  }
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = windBuf;
  windSrc.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 800;
  windFilter.Q.value = 0.3;

  const windGain = ctx.createGain();
  windGain.gain.value = 0.5;

  // Wind variation LFO
  const windLfo = ctx.createOscillator();
  windLfo.frequency.value = 0.2;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 0.25;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windGain.gain);
  windLfo.start();
  allOsc.push(windLfo);

  windSrc.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(dest);

  // Bird-like chirps: sine oscillators with frequency modulation
  const birdGain = ctx.createGain();
  birdGain.gain.value = 0.12;

  const bird1 = ctx.createOscillator();
  bird1.type = 'sine';
  bird1.frequency.value = 2400;
  const birdMod1 = ctx.createOscillator();
  birdMod1.frequency.value = 5;
  const birdModGain1 = ctx.createGain();
  birdModGain1.gain.value = 300;
  birdMod1.connect(birdModGain1);
  birdModGain1.connect(bird1.frequency);

  // Tremolo on bird
  const birdTremolo = ctx.createOscillator();
  birdTremolo.frequency.value = 8;
  const birdTremoloGain = ctx.createGain();
  birdTremoloGain.gain.value = 0.06;
  birdTremolo.connect(birdTremoloGain);
  birdTremoloGain.connect(birdGain.gain);
  birdTremolo.start();

  bird1.connect(birdGain);
  birdGain.connect(dest);
  bird1.start();
  birdMod1.start();
  allOsc.push(bird1, birdMod1, birdTremolo);

  // Second bird layer
  const bird2Gain = ctx.createGain();
  bird2Gain.gain.value = 0.08;
  const bird2 = ctx.createOscillator();
  bird2.type = 'sine';
  bird2.frequency.value = 3200;
  const birdMod2 = ctx.createOscillator();
  birdMod2.frequency.value = 3;
  const birdModGain2 = ctx.createGain();
  birdModGain2.gain.value = 500;
  birdMod2.connect(birdModGain2);
  birdModGain2.connect(bird2.frequency);
  bird2.connect(bird2Gain);
  bird2Gain.connect(dest);
  bird2.start();
  birdMod2.start();
  allOsc.push(bird2, birdMod2);

  return {
    nodes: [windSrc, windFilter, windGain, windLfo, windLfoGain, birdGain, bird1, birdMod1, birdModGain1, birdTremolo, birdTremoloGain, bird2, birdMod2, birdModGain2, bird2Gain],
    stop: () => {
      windSrc.stop();
      allOsc.forEach((o) => o.stop());
    },
  };
}

// ── Fire crackling (noise bursts with resonance) ──
function createFire(ctx: AudioContext, dest: AudioNode) {
  // Base: brown noise (low rumble)
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 400;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.5;

  source.connect(lpf);
  lpf.connect(rumbleGain);
  rumbleGain.connect(dest);

  // Crackling: band-passed noise with fast modulation
  const crackBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const crackData = crackBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Sparse crackling pops
    crackData[i] = Math.random() > 0.97 ? (Math.random() * 2 - 1) : 0;
  }
  const crackSrc = ctx.createBufferSource();
  crackSrc.buffer = crackBuf;
  crackSrc.loop = true;

  const crackBpf = ctx.createBiquadFilter();
  crackBpf.type = 'bandpass';
  crackBpf.frequency.value = 3000;
  crackBpf.Q.value = 1.5;

  const crackGain = ctx.createGain();
  crackGain.gain.value = 1.2;

  // Modulate crackle intensity
  const crackLfo = ctx.createOscillator();
  crackLfo.frequency.value = 0.3;
  const crackLfoGain = ctx.createGain();
  crackLfoGain.gain.value = 0.5;
  crackLfo.connect(crackLfoGain);
  crackLfoGain.connect(crackGain.gain);
  crackLfo.start();

  crackSrc.connect(crackBpf);
  crackBpf.connect(crackGain);
  crackGain.connect(dest);

  // Mid-freq hiss (fire hiss)
  const hissBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const hissData = hissBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    hissData[i] = Math.random() * 2 - 1;
  }
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = hissBuf;
  hissSrc.loop = true;

  const hissBpf = ctx.createBiquadFilter();
  hissBpf.type = 'bandpass';
  hissBpf.frequency.value = 1500;
  hissBpf.Q.value = 0.7;

  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.25;

  hissSrc.connect(hissBpf);
  hissBpf.connect(hissGain);
  hissGain.connect(dest);

  return {
    nodes: [source, lpf, rumbleGain, crackSrc, crackBpf, crackGain, crackLfo, crackLfoGain, hissSrc, hissBpf, hissGain],
    stop: () => {
      source.stop();
      crackSrc.stop();
      crackLfo.stop();
      hissSrc.stop();
    },
  };
}
