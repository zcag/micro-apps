import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, trackEvent } from '@micro-apps/shared';
import {
  loadSettings,
  saveSettings,
  getTodaySessions,
  incrementSessions,
  getStreak,
  DEFAULT_SETTINGS,
  type Settings,
} from './storage';
import { playChime, startAmbient, stopAmbient, type AmbientType } from './audio';
import styles from './App.module.css';

type Phase = 'work' | 'shortBreak' | 'longBreak';
type TimerState = 'idle' | 'running' | 'paused';

const SESSIONS_BEFORE_LONG_BREAK = 4;
const CONFETTI_COLORS = ['#ff3b30', '#ff9500', '#34c759', '#0a84ff', '#af52de', '#ff2d55'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function phaseDuration(phase: Phase, settings: Settings): number {
  switch (phase) {
    case 'work': return settings.workMinutes * 60;
    case 'shortBreak': return settings.shortBreakMinutes * 60;
    case 'longBreak': return settings.longBreakMinutes * 60;
  }
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'work': return 'WORK';
    case 'shortBreak': return 'SHORT BREAK';
    case 'longBreak': return 'LONG BREAK';
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>('work');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [timeLeft, setTimeLeft] = useState(() => phaseDuration('work', loadSettings()));
  const [completedInCycle, setCompletedInCycle] = useState(0); // 0-3, resets after long break
  const [todaySessions, setTodaySessions] = useState(getTodaySessions);
  const [streak, setStreak] = useState(getStreak);
  const [showConfetti, setShowConfetti] = useState(false);
  const [ambient, setAmbient] = useState<AmbientType | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Complete a phase
  const completePhase = useCallback(() => {
    clearTimer();
    playChime();

    // Vibrate
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    if (phase === 'work') {
      // Completed a work session
      const sessions = incrementSessions();
      setTodaySessions(sessions);
      setStreak(getStreak());
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1500);

      trackEvent('session_complete', { phase: 'work' });

      const newCompleted = completedInCycle + 1;
      if (newCompleted >= SESSIONS_BEFORE_LONG_BREAK) {
        // Time for long break
        setCompletedInCycle(0);
        setPhase('longBreak');
        setTimeLeft(phaseDuration('longBreak', settings));
        if (settings.autoStart) {
          setTimerState('running');
        } else {
          setTimerState('idle');
        }
      } else {
        setCompletedInCycle(newCompleted);
        setPhase('shortBreak');
        setTimeLeft(phaseDuration('shortBreak', settings));
        if (settings.autoStart) {
          setTimerState('running');
        } else {
          setTimerState('idle');
        }
      }
    } else {
      // Break completed, back to work
      setPhase('work');
      setTimeLeft(phaseDuration('work', settings));
      if (settings.autoStart) {
        setTimerState('running');
      } else {
        setTimerState('idle');
      }
    }
  }, [clearTimer, phase, completedInCycle, settings]);

  // Timer tick
  useEffect(() => {
    if (timerState !== 'running') {
      clearTimer();
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          completePhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [timerState, clearTimer, completePhase]);

  const handleStart = () => {
    setTimerState('running');
    trackEvent('timer_start', { phase });
  };

  const handlePause = () => {
    setTimerState('paused');
  };

  const handleReset = () => {
    clearTimer();
    setTimerState('idle');
    setPhase('work');
    setTimeLeft(phaseDuration('work', settings));
    setCompletedInCycle(0);
  };

  const handleSettingChange = (key: keyof Settings, value: number | boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    // If idle, update timeLeft to reflect new duration
    if (timerState === 'idle') {
      setTimeLeft(phaseDuration(phase, next));
    }
  };

  const toggleAmbient = (type: AmbientType) => {
    if (ambient === type) {
      stopAmbient();
      setAmbient(null);
    } else {
      startAmbient(type);
      setAmbient(type);
    }
  };

  // Cleanup ambient on unmount
  useEffect(() => () => stopAmbient(), []);

  // SVG circle math
  const radius = 126;
  const circumference = 2 * Math.PI * radius;
  const totalDuration = phaseDuration(phase, settings);
  const progress = totalDuration > 0 ? timeLeft / totalDuration : 1;
  const dashOffset = circumference * (1 - progress);

  const isBreak = phase !== 'work';

  return (
    <Layout title="Pomodoro Timer">
      <div className={styles.container}>
        {/* Timer circle */}
        <div className={styles.timerWrapper}>
          <svg className={styles.timerSvg} viewBox="0 0 280 280">
            <circle className={styles.trackCircle} cx="140" cy="140" r={radius} />
            <circle
              className={`${styles.progressCircle} ${isBreak ? styles.progressBreak : styles.progressWork}`}
              cx="140"
              cy="140"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className={styles.timerContent}>
            <div className={styles.time}>{formatTime(timeLeft)}</div>
            <div className={`${styles.phase} ${isBreak ? styles.phaseBreak : styles.phaseWork}`}>
              {phaseLabel(phase)}
            </div>
          </div>
        </div>

        {/* Session dots (progress toward long break) */}
        <div className={styles.sessionDots}>
          {Array.from({ length: SESSIONS_BEFORE_LONG_BREAK }).map((_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${
                i < completedInCycle
                  ? styles.dotCompleted
                  : i === completedInCycle && phase === 'work'
                    ? styles.dotActive
                    : ''
              }`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {timerState === 'running' ? (
            <button className={`${styles.controlBtn} ${styles.pauseBtn}`} onClick={handlePause}>
              Pause
            </button>
          ) : (
            <button className={`${styles.controlBtn} ${styles.startBtn}`} onClick={handleStart}>
              {timerState === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}
          <button className={`${styles.controlBtn} ${styles.resetBtn}`} onClick={handleReset}>
            Reset
          </button>
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statValue}>{todaySessions}</div>
            <div className={styles.statLabel}>Sessions</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>{streak}</div>
            <div className={styles.statLabel}>Day Streak</div>
          </div>
        </div>

        {/* Bottom buttons: ambient sounds + settings */}
        <div className={styles.bottomBar}>
          <button
            className={`${styles.iconBtn} ${ambient === 'rain' ? styles.iconBtnActive : ''}`}
            onClick={() => toggleAmbient('rain')}
          >
            Rain
          </button>
          <button
            className={`${styles.iconBtn} ${ambient === 'white' ? styles.iconBtnActive : ''}`}
            onClick={() => toggleAmbient('white')}
          >
            Noise
          </button>
          <button
            className={`${styles.iconBtn} ${ambient === 'coffee' ? styles.iconBtnActive : ''}`}
            onClick={() => toggleAmbient('coffee')}
          >
            Cafe
          </button>
        </div>

        <button
          className={styles.iconBtn}
          style={{ width: '100%', maxWidth: 320 }}
          onClick={() => setShowSettings(true)}
        >
          Settings
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div className={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
            <div className={styles.settingsPanel} onClick={(e) => e.stopPropagation()}>
              <div className={styles.settingsTitle}>Settings</div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Work (min)</span>
                <input
                  className={styles.settingInput}
                  type="number"
                  min="1"
                  max="120"
                  value={settings.workMinutes}
                  onChange={(e) => handleSettingChange('workMinutes', Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Short Break (min)</span>
                <input
                  className={styles.settingInput}
                  type="number"
                  min="1"
                  max="60"
                  value={settings.shortBreakMinutes}
                  onChange={(e) => handleSettingChange('shortBreakMinutes', Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Long Break (min)</span>
                <input
                  className={styles.settingInput}
                  type="number"
                  min="1"
                  max="60"
                  value={settings.longBreakMinutes}
                  onChange={(e) => handleSettingChange('longBreakMinutes', Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Auto-start next</span>
                <button
                  className={`${styles.toggleSwitch} ${settings.autoStart ? styles.toggleSwitchOn : ''}`}
                  onClick={() => handleSettingChange('autoStart', !settings.autoStart)}
                >
                  <div className={`${styles.toggleKnob} ${settings.autoStart ? styles.toggleKnobOn : ''}`} />
                </button>
              </div>

              <button className={styles.settingsClose} onClick={() => setShowSettings(false)}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Confetti */}
        {showConfetti && (
          <div className={styles.confettiContainer}>
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className={styles.confettiPiece}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 20 - 10}%`,
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${Math.random() * 0.5}s`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
