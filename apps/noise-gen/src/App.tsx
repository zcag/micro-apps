import { useState, useCallback, useEffect, useRef } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  SoundId,
  startSound,
  stopSound,
  stopAll,
  setSoundVolume,
  setMasterVolume,
  isSoundActive,
  isAnySoundActive,
  getAnalyserNode,
} from './audio';
import styles from './App.module.css';

interface SoundConfig {
  id: SoundId;
  label: string;
  icon: string;
  category: 'noise' | 'nature';
  color: string;
}

const SOUNDS: SoundConfig[] = [
  { id: 'white', label: 'White', icon: '\u2B24', category: 'noise', color: '#e2e8f0' },
  { id: 'pink', label: 'Pink', icon: '\u2B24', category: 'noise', color: '#f9a8d4' },
  { id: 'brown', label: 'Brown', icon: '\u2B24', category: 'noise', color: '#a78bfa' },
  { id: 'rain', label: 'Rain', icon: '\uD83C\uDF27\uFE0F', category: 'nature', color: '#60a5fa' },
  { id: 'ocean', label: 'Ocean', icon: '\uD83C\uDF0A', category: 'nature', color: '#22d3ee' },
  { id: 'forest', label: 'Forest', icon: '\uD83C\uDF3F', category: 'nature', color: '#4ade80' },
  { id: 'fire', label: 'Fire', icon: '\uD83D\uDD25', category: 'nature', color: '#fb923c' },
];

type TimerOption = 0 | 15 | 30 | 60 | 120;
const TIMER_OPTIONS: { label: string; value: string }[] = [
  { label: '\u221E', value: '0' },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '1h', value: '60' },
  { label: '2h', value: '120' },
];

interface Preset {
  name: string;
  icon: string;
  sounds: Partial<Record<SoundId, number>>;
}

const PRESETS: Preset[] = [
  { name: 'Deep Focus', icon: '\uD83C\uDFAF', sounds: { brown: 0.6, rain: 0.3 } },
  { name: 'Sleep', icon: '\uD83C\uDF19', sounds: { pink: 0.5, ocean: 0.4 } },
  { name: 'Cafe Ambience', icon: '\u2615', sounds: { white: 0.15, fire: 0.5, brown: 0.2 } },
];

export default function App() {
  const [volumes, setVolumes] = useState<Record<SoundId, number>>(() => {
    const v: Record<string, number> = {};
    SOUNDS.forEach((s) => (v[s.id] = 0.5));
    return v as Record<SoundId, number>;
  });
  const [active, setActive] = useState<Set<SoundId>>(new Set());
  const [masterVol, setMasterVol] = useState(0.7);
  const [playing, setPlaying] = useState(false);
  const [timer, setTimer] = useState<TimerOption>(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Spacebar toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Timer countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeLeft === null || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          handleStopAll();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft !== null]);

  // Visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const analyser = getAnalyserNode();
      if (!analyser || !playing) {
        // Draw calm wave when not playing
        drawCalmWave(ctx, w, h, Date.now());
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Draw beautiful frequency bars
      const barCount = 64;
      const barWidth = w / barCount;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barH = val * h * 0.8;
        const x = i * barWidth;

        // Get color from active sounds
        const hue = 230 + i * 2;
        const alpha = 0.3 + val * 0.7;
        ctx.fillStyle = `hsla(${hue}, 70%, 65%, ${alpha})`;

        const radius = Math.min(barWidth * 0.4, 3);
        const y = h - barH;
        ctx.beginPath();
        ctx.roundRect(x + 1, y, barWidth - 2, barH, radius);
        ctx.fill();

        // Mirror reflection
        ctx.fillStyle = `hsla(${hue}, 70%, 65%, ${alpha * 0.15})`;
        ctx.beginPath();
        ctx.roundRect(x + 1, h, barWidth - 2, barH * 0.3, radius);
        ctx.fill();
      }
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animRef.current);
    };
  }, [playing, active.size]);

  function drawCalmWave(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    const t = time / 2000;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = h / 2 + Math.sin(x * 0.02 + t) * 8 + Math.sin(x * 0.01 + t * 0.7) * 5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'hsla(230, 60%, 65%, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const toggleSound = useCallback((id: SoundId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        stopSound(id);
        next.delete(id);
        trackEvent('noise_sound_off', { sound: id });
      } else {
        startSound(id, volumes[id]);
        next.add(id);
        trackEvent('noise_sound_on', { sound: id });
      }
      setPlaying(next.size > 0);
      return next;
    });
  }, [volumes]);

  const handleVolumeChange = useCallback((id: SoundId, val: number) => {
    setVolumes((prev) => ({ ...prev, [id]: val }));
    setSoundVolume(id, val);
  }, []);

  const handleMasterVolume = useCallback((val: number) => {
    setMasterVol(val);
    setMasterVolume(val);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (playing) {
      // Pause all
      stopAll();
      setPlaying(false);
      setTimeLeft(null);
      trackEvent('noise_pause');
    } else if (active.size > 0) {
      // Resume active sounds
      active.forEach((id) => startSound(id, volumes[id]));
      setPlaying(true);
      if (timer > 0) setTimeLeft(timer * 60);
      trackEvent('noise_play');
    }
  }, [playing, active, volumes, timer]);

  const handleStopAll = useCallback(() => {
    stopAll();
    setActive(new Set());
    setPlaying(false);
    setTimeLeft(null);
    trackEvent('noise_stop_all');
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    // Stop all current
    stopAll();
    const newActive = new Set<SoundId>();
    const newVolumes = { ...volumes };

    for (const [id, vol] of Object.entries(preset.sounds)) {
      const soundId = id as SoundId;
      newVolumes[soundId] = vol!;
      startSound(soundId, vol!);
      newActive.add(soundId);
    }

    setVolumes(newVolumes as Record<SoundId, number>);
    setActive(newActive);
    setPlaying(true);
    if (timer > 0) setTimeLeft(timer * 60);
    trackEvent('noise_preset', { preset: preset.name });
  }, [volumes, timer]);

  const handleTimerChange = useCallback((val: string) => {
    const mins = parseInt(val) as TimerOption;
    setTimer(mins);
    if (mins === 0) {
      setTimeLeft(null);
    } else if (playing) {
      setTimeLeft(mins * 60);
    }
  }, [playing]);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const noiseSounds = SOUNDS.filter((s) => s.category === 'noise');
  const natureSounds = SOUNDS.filter((s) => s.category === 'nature');

  return (
    <Layout title="Noise Generator">
      <div className={styles.container}>
        {/* Visualization */}
        <div className={styles.vizContainer}>
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.vizOverlay}>
            <button
              className={`${styles.playBtn} ${playing ? styles.playBtnActive : ''}`}
              onClick={togglePlayPause}
              disabled={active.size === 0}
            >
              {playing ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </button>
            {timeLeft !== null && (
              <div className={styles.timerDisplay}>{formatTime(timeLeft)}</div>
            )}
          </div>
        </div>

        {/* Master Volume */}
        <Card variant="glass">
          <div className={styles.masterControl}>
            <div className={styles.masterLabel}>
              <span className={styles.masterIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </span>
              <span>Master Volume</span>
              <span className={styles.volValue}>{Math.round(masterVol * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVol}
              onChange={(e) => handleMasterVolume(parseFloat(e.target.value))}
              className={styles.slider}
              style={{ '--slider-color': 'var(--accent)' } as React.CSSProperties}
            />
          </div>
        </Card>

        {/* Noise Types */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Noise</span>
            <div className={styles.soundGrid}>
              {noiseSounds.map((s) => (
                <SoundTile
                  key={s.id}
                  sound={s}
                  isActive={active.has(s.id)}
                  volume={volumes[s.id]}
                  onToggle={() => toggleSound(s.id)}
                  onVolumeChange={(v) => handleVolumeChange(s.id, v)}
                />
              ))}
            </div>
          </div>
        </Card>

        {/* Nature Sounds */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Nature</span>
            <div className={styles.soundGrid}>
              {natureSounds.map((s) => (
                <SoundTile
                  key={s.id}
                  sound={s}
                  isActive={active.has(s.id)}
                  volume={volumes[s.id]}
                  onToggle={() => toggleSound(s.id)}
                  onVolumeChange={(v) => handleVolumeChange(s.id, v)}
                />
              ))}
            </div>
          </div>
        </Card>

        {/* Presets */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Presets</span>
            <div className={styles.presetGrid}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  className={styles.presetBtn}
                  onClick={() => applyPreset(p)}
                >
                  <span className={styles.presetIcon}>{p.icon}</span>
                  <span className={styles.presetName}>{p.name}</span>
                  <span className={styles.presetSounds}>
                    {Object.keys(p.sounds).join(' + ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Timer */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Auto-Stop Timer</span>
            <SegmentedControl
              options={TIMER_OPTIONS}
              value={String(timer)}
              onChange={handleTimerChange}
            />
          </div>
        </Card>

        {/* Stop All */}
        {active.size > 0 && (
          <Button variant="secondary" onClick={handleStopAll} haptic>
            Stop All Sounds
          </Button>
        )}

        <p className={styles.hint}>Press spacebar to play/pause</p>
      </div>
    </Layout>
  );
}

// ── Sound Tile Component ──
interface SoundTileProps {
  sound: SoundConfig;
  isActive: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
}

function SoundTile({ sound, isActive, volume, onToggle, onVolumeChange }: SoundTileProps) {
  return (
    <div className={`${styles.soundTile} ${isActive ? styles.soundTileActive : ''}`}>
      <button
        className={styles.soundToggle}
        onClick={onToggle}
        style={{
          '--tile-color': sound.color,
          borderColor: isActive ? sound.color : undefined,
          background: isActive ? `${sound.color}15` : undefined,
        } as React.CSSProperties}
      >
        <span className={styles.soundIcon}>{sound.icon}</span>
        <span className={styles.soundLabel}>{sound.label}</span>
      </button>
      {isActive && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className={styles.tileSlider}
          style={{ '--slider-color': sound.color } as React.CSSProperties}
        />
      )}
    </div>
  );
}
