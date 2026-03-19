import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
const CONFETTI_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ff2d55', '#5ac8fa'];
const CONFETTI_SHAPES = ['circle', 'star', 'rect'] as const;
const ENCOURAGE_MESSAGES = [
  'Great focus! 🎯',
  'You crushed it! 💪',
  'Amazing work! ✨',
  'Keep it up! 🚀',
  'Well done! 🌟',
  'Nailed it! 🎉',
];

function phaseDuration(phase: Phase, settings: Settings): number {
  switch (phase) {
    case 'work': return settings.workMinutes * 60;
    case 'shortBreak': return settings.shortBreakMinutes * 60;
    case 'longBreak': return settings.longBreakMinutes * 60;
  }
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'work': return 'Focus Time';
    case 'shortBreak': return 'Short Break';
    case 'longBreak': return 'Long Break';
  }
}

/** Renders each digit with slide animation on change */
function AnimatedDigits({ value, prevValue }: { value: string; prevValue: string }) {
  return (
    <>
      {value.split('').map((char, i) => {
        const changed = prevValue[i] !== char;
        return (
          <span key={`${i}-${char}`} className={styles.digitWrapper}>
            <span className={`${styles.digit} ${changed ? styles.digitSlideDown : ''}`}>
              {char}
            </span>
          </span>
        );
      })}
    </>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>('work');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [timeLeft, setTimeLeft] = useState(() => phaseDuration('work', loadSettings()));
  const [completedInCycle, setCompletedInCycle] = useState(0);
  const [todaySessions, setTodaySessions] = useState(getTodaySessions);
  const [streak, setStreak] = useState(getStreak);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [encourageText, setEncourageText] = useState('');
  const [ambient, setAmbient] = useState<AmbientType | null>(null);
  const [prevTimeStr, setPrevTimeStr] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Format time
  const timeStr = useMemo(() => {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [timeLeft]);

  // Track previous time for digit animation
  useEffect(() => {
    const timer = setTimeout(() => setPrevTimeStr(timeStr), 350);
    return () => clearTimeout(timer);
  }, [timeStr]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const completePhase = useCallback(() => {
    clearTimer();
    playChime();

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    if (phase === 'work') {
      const sessions = incrementSessions();
      setTodaySessions(sessions);
      setStreak(getStreak());
      setShowConfetti(true);
      setShowFlash(true);
      setEncourageText(ENCOURAGE_MESSAGES[Math.floor(Math.random() * ENCOURAGE_MESSAGES.length)]);
      setTimeout(() => {
        setShowConfetti(false);
        setShowFlash(false);
        setEncourageText('');
      }, 2000);

      trackEvent('session_complete', { phase: 'work' });

      const newCompleted = completedInCycle + 1;
      if (newCompleted >= SESSIONS_BEFORE_LONG_BREAK) {
        setCompletedInCycle(0);
        setPhase('longBreak');
        setTimeLeft(phaseDuration('longBreak', settings));
      } else {
        setCompletedInCycle(newCompleted);
        setPhase('shortBreak');
        setTimeLeft(phaseDuration('shortBreak', settings));
      }
      if (settings.autoStart) {
        setTimerState('running');
      } else {
        setTimerState('idle');
      }
    } else {
      setPhase('work');
      setTimeLeft(phaseDuration('work', settings));
      if (settings.autoStart) {
        setTimerState('running');
      } else {
        setTimerState('idle');
      }
    }
  }, [clearTimer, phase, completedInCycle, settings]);

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
    if (timerState === 'idle') {
      setTimeLeft(phaseDuration(phase, next));
    }
  };

  const handleStepperChange = (key: 'workMinutes' | 'shortBreakMinutes' | 'longBreakMinutes', delta: number) => {
    const min = 1;
    const max = key === 'workMinutes' ? 120 : 60;
    const newVal = Math.max(min, Math.min(max, settings[key] + delta));
    handleSettingChange(key, newVal);
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

  useEffect(() => () => stopAmbient(), []);

  // SVG circle math
  const radius = 126;
  const circumference = 2 * Math.PI * radius;
  const totalDuration = phaseDuration(phase, settings);
  const progress = totalDuration > 0 ? timeLeft / totalDuration : 1;
  const dashOffset = circumference * (1 - progress);

  const isBreak = phase !== 'work';
  const isActive = timerState === 'running';

  return (
    <Layout title="Pomodoro Timer">
      <div className={styles.container}>
        {/* Animated ambient background */}
        <div className={`${styles.ambientBg} ${isBreak ? styles.ambientBreak : styles.ambientWork}`} />

        {/* Timer circle */}
        <div className={styles.timerWrapper}>
          {/* Glow behind ring */}
          <div className={`${styles.timerGlow} ${isBreak ? styles.timerGlowBreak : styles.timerGlowWork}`} />

          <svg className={styles.timerSvg} viewBox="0 0 280 280">
            <defs>
              <linearGradient id="gradientWork" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <linearGradient id="gradientBreak" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--success)" />
                <stop offset="100%" stopColor="#14b8a6" />
              </linearGradient>
            </defs>
            <circle className={styles.trackCircle} cx="140" cy="140" r={radius} />
            <circle
              className={`${styles.progressCircle} ${isBreak ? styles.progressBreak : styles.progressWork} ${isActive ? styles.timerPulse : ''}`}
              cx="140"
              cy="140"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className={styles.timerContent}>
            <div className={styles.time}>
              <AnimatedDigits value={timeStr} prevValue={prevTimeStr || timeStr} />
            </div>
            <div className={`${styles.phase} ${isBreak ? styles.phaseBreak : styles.phaseWork}`}>
              {phaseLabel(phase)}
            </div>
          </div>
        </div>

        {/* Session progress dots with connectors */}
        <div className={styles.sessionProgress}>
          {Array.from({ length: SESSIONS_BEFORE_LONG_BREAK }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                className={`${styles.sessionDot} ${
                  i < completedInCycle
                    ? styles.sessionDotCompleted
                    : i === completedInCycle && phase === 'work'
                      ? styles.sessionDotActive
                      : ''
                }`}
              />
              {i < SESSIONS_BEFORE_LONG_BREAK - 1 && (
                <div className={`${styles.sessionConnector} ${i < completedInCycle ? styles.sessionConnectorDone : ''}`} />
              )}
            </div>
          ))}
        </div>

        {/* Streak badge */}
        {streak > 0 && (
          <div className={`${styles.streakBadge} ${streak >= 2 ? styles.streakActive : ''}`}>
            <span className={styles.streakFlame}>🔥</span>
            <span>{streak} day streak</span>
          </div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          {timerState === 'running' ? (
            <button className={`${styles.controlBtn} ${styles.pauseBtn}`} onClick={handlePause}>
              Pause
            </button>
          ) : (
            <button
              className={`${styles.controlBtn} ${styles.startBtn} ${timerState === 'idle' ? styles.startBtnIdle : ''}`}
              onClick={handleStart}
            >
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
            🌧 Rain
          </button>
          <button
            className={`${styles.iconBtn} ${ambient === 'white' ? styles.iconBtnActive : ''}`}
            onClick={() => toggleAmbient('white')}
          >
            🔊 Noise
          </button>
          <button
            className={`${styles.iconBtn} ${ambient === 'coffee' ? styles.iconBtnActive : ''}`}
            onClick={() => toggleAmbient('coffee')}
          >
            ☕ Cafe
          </button>
        </div>

        <button
          className={styles.iconBtn}
          style={{ width: '100%', maxWidth: 320 }}
          onClick={() => setShowSettings(true)}
        >
          ⚙ Settings
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div className={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
            <div className={styles.settingsPanel} onClick={(e) => e.stopPropagation()}>
              <div className={styles.settingsTitle}>Settings</div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Work (min)</span>
                <div className={styles.stepperGroup}>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('workMinutes', -1)}>−</button>
                  <span className={styles.stepperValue}>{settings.workMinutes}</span>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('workMinutes', 1)}>+</button>
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Short Break (min)</span>
                <div className={styles.stepperGroup}>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('shortBreakMinutes', -1)}>−</button>
                  <span className={styles.stepperValue}>{settings.shortBreakMinutes}</span>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('shortBreakMinutes', 1)}>+</button>
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Long Break (min)</span>
                <div className={styles.stepperGroup}>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('longBreakMinutes', -1)}>−</button>
                  <span className={styles.stepperValue}>{settings.longBreakMinutes}</span>
                  <button className={styles.stepperBtn} onClick={() => handleStepperChange('longBreakMinutes', 1)}>+</button>
                </div>
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

        {/* Confetti with varied shapes */}
        {showConfetti && (
          <div className={styles.confettiContainer}>
            {Array.from({ length: 40 }).map((_, i) => {
              const shape = CONFETTI_SHAPES[i % CONFETTI_SHAPES.length];
              const size = 6 + Math.random() * 8;
              return (
                <div
                  key={i}
                  className={`${styles.confettiPiece} ${
                    shape === 'circle' ? styles.confettiCircle :
                    shape === 'star' ? styles.confettiStar :
                    styles.confettiRect
                  }`}
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 15 - 10}%`,
                    width: size,
                    height: size,
                    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    animationDelay: `${Math.random() * 0.6}s`,
                    transform: `rotate(${Math.random() * 360}deg)`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Completion flash */}
        {showFlash && <div className={styles.completionFlash} />}

        {/* Encouraging message */}
        {encourageText && <div className={styles.encourageMsg}>{encourageText}</div>}
      </div>
    </Layout>
  );
}
