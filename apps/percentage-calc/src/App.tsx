import { useState, useCallback, useMemo } from 'react';
import { Layout, Card, Button, Input, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  CalcMode,
  HistoryEntry,
  loadHistory,
  saveHistory,
  generateId,
} from './storage';
import styles from './App.module.css';

const QUICK_PERCENTS = [10, 15, 20, 25, 50, 75];

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function App() {
  const [mode, setMode] = useState<CalcMode>('whatIs');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [copied, setCopied] = useState(false);

  // whatIs: What is X% of Y?
  const [whatIsPercent, setWhatIsPercent] = useState('');
  const [whatIsOf, setWhatIsOf] = useState('');

  // whatPercent: X is what % of Y?
  const [whatPercentX, setWhatPercentX] = useState('');
  const [whatPercentY, setWhatPercentY] = useState('');

  // change: From X to Y
  const [changeFrom, setChangeFrom] = useState('');
  const [changeTo, setChangeTo] = useState('');

  const result = useMemo(() => {
    if (mode === 'whatIs') {
      const pct = parseFloat(whatIsPercent);
      const val = parseFloat(whatIsOf);
      if (isNaN(pct) || isNaN(val)) return null;
      const r = (pct / 100) * val;
      return {
        value: r,
        display: formatNum(r),
        expression: `${whatIsPercent}% of ${whatIsOf}`,
        barPct: Math.min(100, Math.abs(pct)),
      };
    }
    if (mode === 'whatPercent') {
      const x = parseFloat(whatPercentX);
      const y = parseFloat(whatPercentY);
      if (isNaN(x) || isNaN(y) || y === 0) return null;
      const r = (x / y) * 100;
      return {
        value: r,
        display: `${formatNum(r)}%`,
        expression: `${whatPercentX} is what % of ${whatPercentY}`,
        barPct: Math.min(100, Math.abs(r)),
      };
    }
    if (mode === 'change') {
      const from = parseFloat(changeFrom);
      const to = parseFloat(changeTo);
      if (isNaN(from) || isNaN(to) || from === 0) return null;
      const r = ((to - from) / Math.abs(from)) * 100;
      const direction = r >= 0 ? 'increase' : 'decrease';
      return {
        value: r,
        display: `${r >= 0 ? '+' : ''}${formatNum(r)}%`,
        expression: `From ${changeFrom} to ${changeTo}`,
        barPct: Math.min(100, Math.abs(r)),
        direction,
      };
    }
    return null;
  }, [mode, whatIsPercent, whatIsOf, whatPercentX, whatPercentY, changeFrom, changeTo]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result.display).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);

      // Save to history
      const entry: HistoryEntry = {
        id: generateId(),
        mode,
        expression: result.expression,
        result: result.display,
        timestamp: Date.now(),
      };
      const updated = [entry, ...history].slice(0, 30);
      setHistory(updated);
      saveHistory(updated);
      trackEvent('percentage_copy', { mode });
    });
  }, [result, mode, history]);

  const handleQuickPercent = useCallback((pct: number) => {
    setWhatIsPercent(pct.toString());
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <Layout title="Percentage Calculator">
      <div className={styles.container}>
        {/* Mode Selector */}
        <SegmentedControl
          options={[
            { label: 'X% of Y', value: 'whatIs' },
            { label: 'X is ?% of Y', value: 'whatPercent' },
            { label: '% Change', value: 'change' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as CalcMode)}
        />

        {/* Calculator Card */}
        <Card>
          <div className={styles.calcSection}>
            {mode === 'whatIs' && (
              <>
                <div className={styles.calcLabel}>What is X% of Y?</div>
                <div className={styles.calcRow}>
                  <Input
                    label="Percentage"
                    type="number"
                    value={whatIsPercent}
                    onChange={(e) => setWhatIsPercent(e.target.value)}
                    placeholder="15"
                    suffix="%"
                    inputMode="decimal"
                  />
                  <span className={styles.calcOp}>of</span>
                  <Input
                    label="Value"
                    type="number"
                    value={whatIsOf}
                    onChange={(e) => setWhatIsOf(e.target.value)}
                    placeholder="200"
                    inputMode="decimal"
                  />
                </div>
                <div className={styles.quickPicks}>
                  {QUICK_PERCENTS.map((pct) => (
                    <button
                      key={pct}
                      className={`${styles.quickBtn} ${whatIsPercent === pct.toString() ? styles.quickActive : ''}`}
                      onClick={() => handleQuickPercent(pct)}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </>
            )}

            {mode === 'whatPercent' && (
              <>
                <div className={styles.calcLabel}>X is what % of Y?</div>
                <div className={styles.calcRow}>
                  <Input
                    label="Value (X)"
                    type="number"
                    value={whatPercentX}
                    onChange={(e) => setWhatPercentX(e.target.value)}
                    placeholder="30"
                    inputMode="decimal"
                  />
                  <span className={styles.calcOp}>of</span>
                  <Input
                    label="Total (Y)"
                    type="number"
                    value={whatPercentY}
                    onChange={(e) => setWhatPercentY(e.target.value)}
                    placeholder="200"
                    inputMode="decimal"
                  />
                </div>
              </>
            )}

            {mode === 'change' && (
              <>
                <div className={styles.calcLabel}>Percentage change</div>
                <div className={styles.calcRow}>
                  <Input
                    label="From"
                    type="number"
                    value={changeFrom}
                    onChange={(e) => setChangeFrom(e.target.value)}
                    placeholder="200"
                    inputMode="decimal"
                  />
                  <span className={styles.calcOp}>{'\u2192'}</span>
                  <Input
                    label="To"
                    type="number"
                    value={changeTo}
                    onChange={(e) => setChangeTo(e.target.value)}
                    placeholder="250"
                    inputMode="decimal"
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Result */}
        {result && (
          <Card variant="glass" hoverable={false}>
            <div className={styles.resultSection}>
              <div className={styles.resultExpression}>{result.expression}</div>
              <div
                className={styles.resultValue}
                style={{
                  color:
                    mode === 'change'
                      ? result.value >= 0
                        ? '#22c55e'
                        : '#ef4444'
                      : '#8b5cf6',
                }}
              >
                {result.display}
              </div>

              {/* Visual bar */}
              <div className={styles.resultBar}>
                <div
                  className={styles.resultBarFill}
                  style={{
                    width: `${result.barPct}%`,
                    background:
                      mode === 'change'
                        ? result.value >= 0
                          ? 'linear-gradient(90deg, #22c55e, #84cc16)'
                          : 'linear-gradient(90deg, #ef4444, #f97316)'
                        : 'linear-gradient(90deg, #8b5cf6, #a855f7)',
                  }}
                />
              </div>

              {mode === 'change' && (
                <div
                  className={styles.changeDirection}
                  style={{ color: result.value >= 0 ? '#22c55e' : '#ef4444' }}
                >
                  {result.value >= 0 ? '\u2191 Increase' : '\u2193 Decrease'}
                </div>
              )}

              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? '\u2713 Copied!' : 'Copy Result'}
              </button>
            </div>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <div className={styles.historySection}>
              <div className={styles.historyHeader}>
                <span className={styles.historyTitle}>Recent</span>
                <button className={styles.clearBtn} onClick={handleClearHistory}>
                  Clear
                </button>
              </div>
              <div className={styles.historyList}>
                {history.slice(0, 10).map((entry) => (
                  <div key={entry.id} className={styles.historyItem}>
                    <span className={styles.historyExpr}>{entry.expression}</span>
                    <span className={styles.historyResult}>{entry.result}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
