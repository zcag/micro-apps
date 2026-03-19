import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  Lap,
  Session,
  formatTime,
  formatTimeShort,
  loadSessions,
  saveSessions,
  generateId,
  lapsToCSV,
} from './storage';
import styles from './App.module.css';

export default function App() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [showSessions, setShowSessions] = useState(false);
  const [copied, setCopied] = useState(false);

  const startTimeRef = useRef(0);
  const elapsedBeforePauseRef = useRef(0);
  const rafRef = useRef(0);

  // Use requestAnimationFrame for smooth updates
  const tick = useCallback(() => {
    const now = performance.now();
    setElapsed(elapsedBeforePauseRef.current + (now - startTimeRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleStart = useCallback(() => {
    startTimeRef.current = performance.now();
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
    trackEvent('stopwatch_start');
  }, [tick]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    elapsedBeforePauseRef.current = elapsed;
    setRunning(false);
  }, [elapsed]);

  const handleReset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);

    // Save session if there were laps
    if (laps.length > 0) {
      const session: Session = {
        id: generateId(),
        date: new Date().toISOString().slice(0, 10),
        totalTime: elapsed,
        laps: laps,
      };
      const updated = [session, ...sessions].slice(0, 30);
      setSessions(updated);
      saveSessions(updated);
    }

    setElapsed(0);
    setRunning(false);
    setLaps([]);
    elapsedBeforePauseRef.current = 0;
    startTimeRef.current = 0;
  }, [elapsed, laps, sessions]);

  const handleLap = useCallback(() => {
    const lastLapTotal = laps.length > 0 ? laps[0].totalTime : 0;
    const lap: Lap = {
      number: laps.length + 1,
      lapTime: elapsed - lastLapTotal,
      totalTime: elapsed,
    };
    setLaps((prev) => [lap, ...prev]);
    if (navigator.vibrate) navigator.vibrate(10);
  }, [elapsed, laps]);

  const handleCopyLaps = useCallback(() => {
    if (laps.length === 0) return;
    const csv = lapsToCSV([...laps].reverse());
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [laps]);

  const handleExportCSV = useCallback(() => {
    if (laps.length === 0) return;
    const csv = lapsToCSV([...laps].reverse());
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stopwatch-laps-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [laps]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Find fastest/slowest laps
  const { fastestIdx, slowestIdx, avgLapTime } = useMemo(() => {
    if (laps.length < 2) return { fastestIdx: -1, slowestIdx: -1, avgLapTime: 0 };
    let fIdx = 0;
    let sIdx = 0;
    let total = 0;
    for (let i = 0; i < laps.length; i++) {
      total += laps[i].lapTime;
      if (laps[i].lapTime < laps[fIdx].lapTime) fIdx = i;
      if (laps[i].lapTime > laps[sIdx].lapTime) sIdx = i;
    }
    return { fastestIdx: fIdx, slowestIdx: sIdx, avgLapTime: total / laps.length };
  }, [laps]);

  return (
    <Layout title="Stopwatch">
      <div className={styles.container}>
        {/* Main Time Display */}
        <div className={styles.timeDisplay}>
          <span className={styles.timeValue}>{formatTime(elapsed)}</span>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {!running && elapsed === 0 ? (
            <button className={styles.startBtn} onClick={handleStart}>
              Start
            </button>
          ) : running ? (
            <>
              <button className={styles.lapBtn} onClick={handleLap}>
                Lap
              </button>
              <button className={styles.stopBtn} onClick={handleStop}>
                Stop
              </button>
            </>
          ) : (
            <>
              <button className={styles.resetBtn} onClick={handleReset}>
                Reset
              </button>
              <button className={styles.startBtn} onClick={handleStart}>
                Resume
              </button>
            </>
          )}
        </div>

        {/* Lap List */}
        {laps.length > 0 && (
          <Card>
            <div className={styles.lapSection}>
              <div className={styles.lapHeader}>
                <span className={styles.lapTitle}>Laps ({laps.length})</span>
                <div className={styles.lapActions}>
                  <button
                    className={styles.smallBtn}
                    onClick={handleCopyLaps}
                    title="Copy to clipboard"
                  >
                    {copied ? '\u2713 Copied' : 'Copy'}
                  </button>
                  <button
                    className={styles.smallBtn}
                    onClick={handleExportCSV}
                    title="Export as CSV"
                  >
                    CSV
                  </button>
                </div>
              </div>

              {avgLapTime > 0 && (
                <div className={styles.lapAvg}>
                  Avg: {formatTimeShort(avgLapTime)}
                </div>
              )}

              <div className={styles.lapList}>
                {laps.map((lap, i) => {
                  const isFastest = i === fastestIdx && laps.length >= 2;
                  const isSlowest = i === slowestIdx && laps.length >= 2;
                  const diff = avgLapTime > 0 ? lap.lapTime - avgLapTime : 0;

                  return (
                    <div
                      key={lap.number}
                      className={`${styles.lapRow} ${isFastest ? styles.lapFastest : ''} ${isSlowest ? styles.lapSlowest : ''}`}
                    >
                      <span className={styles.lapNumber}>
                        {isFastest && <span className={styles.lapBadge} style={{ color: '#22c55e' }}>Fastest</span>}
                        {isSlowest && <span className={styles.lapBadge} style={{ color: '#ef4444' }}>Slowest</span>}
                        {!isFastest && !isSlowest && `Lap ${lap.number}`}
                        {(isFastest || isSlowest) && ` Lap ${lap.number}`}
                      </span>
                      <span className={styles.lapTime}>{formatTime(lap.lapTime)}</span>
                      <span className={styles.lapTotal}>{formatTime(lap.totalTime)}</span>
                      {avgLapTime > 0 && (
                        <span
                          className={styles.lapDiff}
                          style={{ color: diff < 0 ? '#22c55e' : diff > 0 ? '#ef4444' : 'var(--text-secondary)' }}
                        >
                          {diff < 0 ? '-' : '+'}{formatTimeShort(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Session History */}
        {sessions.length > 0 && (
          <Card>
            <div className={styles.sessionSection}>
              <button
                className={styles.sessionToggle}
                onClick={() => setShowSessions((s) => !s)}
              >
                <span className={styles.sessionTitle}>
                  Past Sessions ({sessions.length})
                </span>
                <span className={styles.sessionChevron}>
                  {showSessions ? '\u25B2' : '\u25BC'}
                </span>
              </button>

              {showSessions && (
                <div className={styles.sessionList}>
                  {sessions.map((s) => (
                    <div key={s.id} className={styles.sessionItem}>
                      <span className={styles.sessionDate}>{s.date}</span>
                      <span className={styles.sessionTime}>{formatTime(s.totalTime)}</span>
                      <span className={styles.sessionLaps}>{s.laps.length} laps</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
