import { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

type UnitSystem = 'imperial' | 'metric';

interface Dimensions {
  length: string;
  width: string;
  depth: string;
}

interface Results {
  cubicYards: number;
  cubicMeters: number;
  bags60: number;
  bags80: number;
}

const PRESETS: { label: string; emoji: string; dims: Dimensions }[] = [
  { label: 'Sidewalk', emoji: '🚶', dims: { length: '4', width: '20', depth: '0.333' } },
  { label: 'Patio', emoji: '🏡', dims: { length: '10', width: '10', depth: '0.333' } },
  { label: 'Footing', emoji: '🏗️', dims: { length: '2', width: '2', depth: '1' } },
];

const STORAGE_KEY = 'concrete-calc-last';

function loadSaved(): (Dimensions & { unit: UnitSystem }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function calculate(dims: Dimensions, unit: UnitSystem): Results | null {
  const l = parseFloat(dims.length);
  const w = parseFloat(dims.width);
  const d = parseFloat(dims.depth);
  if (isNaN(l) || isNaN(w) || isNaN(d) || l <= 0 || w <= 0 || d <= 0) return null;

  let cubicFt: number;
  if (unit === 'imperial') {
    cubicFt = l * w * d;
  } else {
    cubicFt = l * w * d * 35.3147;
  }

  const cubicYards = cubicFt / 27;
  const cubicMeters = cubicFt * 0.0283168;
  const bags60 = Math.ceil(cubicFt / 0.45);
  const bags80 = Math.ceil(cubicFt / 0.6);

  return { cubicYards, cubicMeters, bags60, bags80 };
}

/** Animated count-up hook */
function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) {
      setDisplay(target);
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

function AnimatedValue({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const animated = useCountUp(value);
  return <>{animated.toFixed(decimals)}</>;
}

function AnimatedInt({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{Math.round(animated)}</>;
}

export default function App() {
  const saved = loadSaved();
  const [unit, setUnit] = useState<UnitSystem>(saved?.unit ?? 'imperial');
  const [dims, setDims] = useState<Dimensions>({
    length: saved?.length ?? '',
    width: saved?.width ?? '',
    depth: saved?.depth ?? '',
  });
  const [results, setResults] = useState<Results | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (saved && dims.length && dims.width && dims.depth) {
      setResults(calculate(dims, unit));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCalculate = () => {
    const r = calculate(dims, unit);
    setResults(r);
    if (r) {
      trackEvent('calculate', { unit });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...dims, unit }));
    }
  };

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    setUnit('imperial');
    setDims(preset.dims);
    setResults(null);
  };

  const handleCopyAll = () => {
    if (!results) return;
    const lines = [
      `Volume: ${results.cubicYards.toFixed(2)} cubic yards / ${results.cubicMeters.toFixed(2)} cubic meters`,
      `60lb bags: ${results.bags60}`,
      `80lb bags: ${results.bags80}`,
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const suffix = unit === 'imperial' ? 'ft' : 'm';
  const hasValidInputs = dims.length && dims.width && dims.depth &&
    parseFloat(dims.length) > 0 && parseFloat(dims.width) > 0 && parseFloat(dims.depth) > 0;

  return (
    <Layout title="Concrete Calculator">
      <div className={styles.container}>
        <div className={styles.heroSection}>
          <Card>
            {/* Unit toggle */}
            <div className={styles.unitSection}>
              <SegmentedControl
                options={[
                  { label: 'Imperial (ft)', value: 'imperial' },
                  { label: 'Metric (m)', value: 'metric' },
                ]}
                value={unit}
                onChange={(v) => {
                  setUnit(v);
                  setResults(null);
                }}
              />
            </div>

            {/* Preset chips */}
            <div className={styles.presetSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>📐</span>
                <span>Quick Presets</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.presetChips}>
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={styles.presetChip}
                    onClick={() => handlePreset(p)}
                    type="button"
                  >
                    <span className={styles.presetEmoji}>{p.emoji}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions input group */}
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                📏 Dimensions
              </div>
              <div className={styles.inputGroupFields}>
                <Input
                  label="Length"
                  suffix={suffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={dims.length}
                  onChange={(e) => setDims({ ...dims, length: e.target.value })}
                />
                <span className={styles.inputConnector}>×</span>
                <Input
                  label="Width"
                  suffix={suffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={dims.width}
                  onChange={(e) => setDims({ ...dims, width: e.target.value })}
                />
                <span className={styles.inputConnector}>×</span>
                <Input
                  label="Depth"
                  suffix={suffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={dims.depth}
                  onChange={(e) => setDims({ ...dims, depth: e.target.value })}
                />
              </div>
            </div>

            {/* Valid indicator */}
            {hasValidInputs && !results && (
              <div className={styles.validIndicator}>
                ✓ Ready to calculate
              </div>
            )}

            <div className={styles.calculateArea}>
              <Button variant="gradient" onClick={handleCalculate} haptic>
                Calculate
              </Button>
            </div>
          </Card>
        </div>

        {/* Results divider */}
        {results && (
          <div className={styles.resultsDivider}>
            <span className={styles.resultsDividerLine} />
            <span className={styles.resultsDividerIcon}>▼</span>
            <span className={styles.resultsDividerLine} />
          </div>
        )}

        {/* Results */}
        {results ? (
          <div className={styles.resultsContainer}>
            {/* Primary result */}
            <div className={styles.primaryResult}>
              <div className={styles.primaryResultLabel}>
                {unit === 'imperial' ? 'Total Volume' : 'Total Volume'}
              </div>
              <div className={styles.primaryResultValue}>
                <AnimatedValue
                  value={unit === 'imperial' ? results.cubicYards : results.cubicMeters}
                />
              </div>
              <div className={styles.primaryResultUnit}>
                {unit === 'imperial' ? 'cubic yards' : 'cubic meters'}
              </div>
            </div>

            {/* Secondary results grid */}
            <div className={styles.secondaryResults}>
              {unit === 'imperial' && (
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>📦</div>
                  <div className={styles.secondaryCardValue}>
                    <AnimatedValue value={results.cubicMeters} />
                  </div>
                  <div className={styles.secondaryCardLabel}>Cubic Meters</div>
                </div>
              )}
              {unit === 'metric' && (
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>📦</div>
                  <div className={styles.secondaryCardValue}>
                    <AnimatedValue value={results.cubicYards} />
                  </div>
                  <div className={styles.secondaryCardLabel}>Cubic Yards</div>
                </div>
              )}
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>🔢</div>
                <div className={styles.secondaryCardValue}>
                  {(results.cubicYards * 27).toFixed(1)}
                </div>
                <div className={styles.secondaryCardLabel}>Cubic Feet</div>
              </div>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>🛍️</div>
                <div className={styles.secondaryCardValue}>
                  <AnimatedInt value={results.bags60} />
                </div>
                <div className={styles.secondaryCardLabel}>60lb Bags</div>
              </div>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>🛍️</div>
                <div className={styles.secondaryCardValue}>
                  <AnimatedInt value={results.bags80} />
                </div>
                <div className={styles.secondaryCardLabel}>80lb Bags</div>
              </div>
            </div>

            {/* Copy button */}
            <button
              className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
              onClick={handleCopyAll}
              type="button"
            >
              <span className={styles.copyIcon}>{copied ? '✓' : '📋'}</span>
              {copied ? 'Copied!' : 'Copy All Results'}
            </button>
          </div>
        ) : (
          /* Empty state */
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🧱</div>
              <div className={styles.emptyStateText}>Enter dimensions to calculate</div>
              <div className={styles.emptyStateHint}>
                or pick a preset above to get started
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
