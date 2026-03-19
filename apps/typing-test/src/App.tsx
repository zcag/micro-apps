import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import { getRandomPassage, Passage } from './passages';
import {
  TestResult,
  BestScores,
  loadBestScores,
  saveBestScores,
  loadHistory,
  saveHistory,
  generateId,
} from './storage';
import styles from './App.module.css';

type GameState = 'idle' | 'running' | 'finished';
type TimeMode = 30 | 60 | 120;

const TIME_OPTIONS = [
  { label: '30s', value: '30' },
  { label: '60s', value: '60' },
  { label: '2min', value: '120' },
];

export default function App() {
  const [timeMode, setTimeMode] = useState<TimeMode>(60);
  const [passage, setPassage] = useState<Passage>(getRandomPassage);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [typed, setTyped] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [bestScores, setBestScores] = useState<BestScores>(loadBestScores);
  const [history, setHistory] = useState<TestResult[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(0 as unknown as ReturnType<typeof setInterval>);
  const startTimeRef = useRef(0);
  const passageRef = useRef(passage);

  passageRef.current = passage;

  // Calculate stats
  const stats = useMemo(() => {
    const chars = typed.length;
    let correct = 0;
    let errors = 0;
    for (let i = 0; i < chars; i++) {
      if (typed[i] === passage.text[i]) {
        correct++;
      } else {
        errors++;
      }
    }
    const accuracy = chars > 0 ? Math.round((correct / chars) * 100) : 100;

    // WPM: (correct chars / 5) / minutes elapsed
    const elapsedMs = gameState === 'running'
      ? (timeMode - timeLeft) * 1000
      : gameState === 'finished'
        ? timeMode * 1000
        : 0;
    const minutes = elapsedMs / 60000;
    const wpm = minutes > 0 ? Math.round((correct / 5) / minutes) : 0;

    return { wpm, accuracy, correct, errors, charsTyped: chars };
  }, [typed, passage.text, timeLeft, timeMode, gameState]);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'running') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setGameState('finished');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState]);

  // Save result when finished
  useEffect(() => {
    if (gameState !== 'finished') return;

    const result: TestResult = {
      id: generateId(),
      date: new Date().toISOString(),
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      timeMode,
      charsTyped: stats.charsTyped,
      errors: stats.errors,
    };

    const newHistory = [result, ...history].slice(0, 10);
    setHistory(newHistory);
    saveHistory(newHistory);

    // Update best score
    const currentBest = bestScores[timeMode] || 0;
    if (stats.wpm > currentBest) {
      const newBest = { ...bestScores, [timeMode]: stats.wpm };
      setBestScores(newBest);
      saveBestScores(newBest);
    }

    trackEvent('typing_test_complete', { wpm: String(stats.wpm), accuracy: String(stats.accuracy), timeMode: String(timeMode) });
    if (navigator.vibrate) navigator.vibrate(20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const handleStart = useCallback(() => {
    setGameState('running');
    setTyped('');
    setTimeLeft(timeMode);
    startTimeRef.current = performance.now();
    inputRef.current?.focus();
    trackEvent('typing_test_start', { timeMode: String(timeMode) });
  }, [timeMode]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (gameState === 'idle') {
      // Auto-start on first keystroke
      setGameState('running');
      setTimeLeft(timeMode);
      startTimeRef.current = performance.now();
      trackEvent('typing_test_start', { timeMode: String(timeMode) });
    }
    if (gameState === 'finished') return;

    const value = e.target.value;
    // Don't allow typing beyond passage length
    if (value.length > passageRef.current.text.length) return;
    setTyped(value);

    // Auto-finish if typed entire passage
    if (value.length === passageRef.current.text.length) {
      clearInterval(timerRef.current);
      setGameState('finished');
    }
  }, [gameState, timeMode]);

  const handleRestart = useCallback(() => {
    clearInterval(timerRef.current);
    setGameState('idle');
    setTyped('');
    setTimeLeft(timeMode);
    inputRef.current?.focus();
  }, [timeMode]);

  const handleNewPassage = useCallback(() => {
    clearInterval(timerRef.current);
    setPassage(getRandomPassage());
    setGameState('idle');
    setTyped('');
    setTimeLeft(timeMode);
    inputRef.current?.focus();
  }, [timeMode]);

  const handleTimeChange = useCallback((value: string) => {
    const t = Number(value) as TimeMode;
    setTimeMode(t);
    if (gameState === 'idle') {
      setTimeLeft(t);
    }
  }, [gameState]);

  // Format time display
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Render passage with character coloring
  const renderPassage = () => {
    const chars = passage.text.split('');
    return chars.map((char, i) => {
      let className = styles.charPending;
      if (i < typed.length) {
        className = typed[i] === char ? styles.charCorrect : styles.charError;
      } else if (i === typed.length) {
        className = styles.charCursor;
      }
      return (
        <span key={i} className={className}>
          {char}
        </span>
      );
    });
  };

  const isNewBest = gameState === 'finished' && stats.wpm > (bestScores[timeMode] || 0) - (stats.wpm === bestScores[timeMode] ? 0 : 1);
  const bestForMode = bestScores[timeMode] || 0;

  // Mini chart for history
  const renderChart = () => {
    if (history.length < 2) return null;
    const maxWpm = Math.max(...history.map((h) => h.wpm), 1);
    const chartItems = [...history].reverse();
    return (
      <div className={styles.chart}>
        <div className={styles.chartLabel}>WPM over time</div>
        <div className={styles.chartBars}>
          {chartItems.map((item, i) => (
            <div key={item.id} className={styles.chartBarWrap}>
              <div
                className={styles.chartBar}
                style={{ height: `${(item.wpm / maxWpm) * 100}%` }}
                title={`${item.wpm} WPM`}
              />
              <span className={styles.chartBarLabel}>{item.wpm}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout title="Typing Speed Test">
      <div className={styles.container}>
        {/* Time mode selector */}
        {gameState === 'idle' && (
          <div className={styles.modeSelector}>
            <SegmentedControl
              options={TIME_OPTIONS}
              value={String(timeMode)}
              onChange={handleTimeChange}
            />
          </div>
        )}

        {/* Timer & WPM display */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{formatTime(timeLeft)}</span>
            <span className={styles.statLabel}>Time</span>
          </div>
          <div className={`${styles.statItem} ${styles.wpmStat}`}>
            <span className={styles.wpmValue}>{stats.wpm}</span>
            <span className={styles.statLabel}>WPM</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{stats.accuracy}%</span>
            <span className={styles.statLabel}>Accuracy</span>
          </div>
        </div>

        {/* Passage display */}
        <Card>
          <div
            className={styles.passageArea}
            onClick={() => inputRef.current?.focus()}
          >
            <div className={styles.passageText}>{renderPassage()}</div>
            <textarea
              ref={inputRef}
              className={styles.hiddenInput}
              value={typed}
              onChange={handleInput}
              disabled={gameState === 'finished'}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </Card>

        {/* Idle: instructions */}
        {gameState === 'idle' && (
          <p className={styles.hint}>Start typing to begin the test, or press the button below</p>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          {gameState === 'idle' && (
            <>
              <Button variant="primary" onClick={handleStart}>Start Test</Button>
              <Button variant="secondary" onClick={handleNewPassage}>New Passage</Button>
            </>
          )}
          {gameState === 'running' && (
            <Button variant="secondary" onClick={handleRestart}>Restart</Button>
          )}
          {gameState === 'finished' && (
            <>
              <Button variant="primary" onClick={handleRestart}>Retry Same</Button>
              <Button variant="secondary" onClick={handleNewPassage}>New Passage</Button>
            </>
          )}
        </div>

        {/* Results screen */}
        {gameState === 'finished' && (
          <div className={styles.results}>
            {stats.wpm >= bestForMode && stats.wpm > 0 && (
              <div className={styles.newBest}>New Personal Best!</div>
            )}
            <Card>
              <div className={styles.resultGrid}>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{stats.wpm}</span>
                  <span className={styles.resultLabel}>Words/min</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{stats.accuracy}%</span>
                  <span className={styles.resultLabel}>Accuracy</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{stats.charsTyped}</span>
                  <span className={styles.resultLabel}>Characters</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{stats.errors}</span>
                  <span className={styles.resultLabel}>Errors</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{formatTime(timeMode)}</span>
                  <span className={styles.resultLabel}>Duration</span>
                </div>
                <div className={styles.resultItem}>
                  <span className={styles.resultValue}>{bestForMode}</span>
                  <span className={styles.resultLabel}>Best WPM</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Personal best display */}
        {gameState === 'idle' && bestForMode > 0 && (
          <div className={styles.bestDisplay}>
            Personal best ({timeMode}s): <strong>{bestForMode} WPM</strong>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <div className={styles.historySection}>
              <button
                className={styles.historyToggle}
                onClick={() => setShowHistory((s) => !s)}
              >
                <span className={styles.historyTitle}>History ({history.length})</span>
                <span className={styles.historyChevron}>{showHistory ? '\u25B2' : '\u25BC'}</span>
              </button>

              {showHistory && (
                <>
                  {renderChart()}
                  <div className={styles.historyList}>
                    {history.map((item) => (
                      <div key={item.id} className={styles.historyItem}>
                        <span className={styles.historyDate}>
                          {new Date(item.date).toLocaleDateString()}
                        </span>
                        <span className={styles.historyWpm}>{item.wpm} WPM</span>
                        <span className={styles.historyAccuracy}>{item.accuracy}%</span>
                        <span className={styles.historyTime}>{item.timeMode}s</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
