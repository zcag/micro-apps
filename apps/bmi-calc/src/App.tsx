import { useState, useCallback, useMemo } from 'react';
import { Layout, Card, Button, Input, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  UnitSystem,
  BmiEntry,
  calculateBmi,
  getBmiCategory,
  getHealthyWeightRange,
  ftInToCm,
  lbsToKg,
  kgToLbs,
  BMI_CATEGORIES,
  loadHistory,
  saveHistory,
  generateId,
} from './storage';
import styles from './App.module.css';

function GaugeMeter({ bmi }: { bmi: number }) {
  // Map BMI 10–45 to 0–100% of the gauge arc
  const clampedBmi = Math.max(10, Math.min(45, bmi));
  const pct = ((clampedBmi - 10) / 35) * 100;
  const category = getBmiCategory(bmi);

  // SVG arc: semicircle from left to right
  const radius = 80;
  const cx = 100;
  const cy = 95;
  const startAngle = Math.PI;
  const endAngle = 0;

  // Category arcs
  const catArcs = BMI_CATEGORIES.map((cat) => {
    const minPct = Math.max(0, ((Math.max(10, cat.min) - 10) / 35) * 100);
    const maxPct = Math.min(100, ((Math.min(45, cat.max) - 10) / 35) * 100);
    const a1 = startAngle - (minPct / 100) * Math.PI;
    const a2 = startAngle - (maxPct / 100) * Math.PI;
    return {
      ...cat,
      d: `M ${cx + radius * Math.cos(a1)} ${cy - radius * Math.sin(a1)} A ${radius} ${radius} 0 0 1 ${cx + radius * Math.cos(a2)} ${cy - radius * Math.sin(a2)}`,
    };
  });

  // Needle position
  const needleAngle = startAngle - (pct / 100) * Math.PI;
  const needleLen = radius - 12;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  return (
    <div className={styles.gaugeContainer}>
      <svg viewBox="0 0 200 110" className={styles.gaugeSvg}>
        {/* Category arcs */}
        {catArcs.map((arc) => (
          <path
            key={arc.label}
            d={arc.d}
            fill="none"
            stroke={arc.color}
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.3"
          />
        ))}
        {/* Active arc up to needle */}
        <path
          d={`M ${cx + radius * Math.cos(startAngle)} ${cy - radius * Math.sin(startAngle)} A ${radius} ${radius} 0 ${pct > 50 ? 1 : 0} 1 ${cx + radius * Math.cos(needleAngle)} ${cy - radius * Math.sin(needleAngle)}`}
          fill="none"
          stroke={category.color}
          strokeWidth="12"
          strokeLinecap="round"
          className={styles.gaugeArcActive}
        />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke={category.color}
          strokeWidth="3"
          strokeLinecap="round"
          className={styles.gaugeNeedle}
        />
        <circle cx={cx} cy={cy} r="5" fill={category.color} />
      </svg>
      <div className={styles.gaugeValue} style={{ color: category.color }}>
        {bmi.toFixed(1)}
      </div>
      <div className={styles.gaugeLabel} style={{ color: category.color }}>
        {category.label}
      </div>
    </div>
  );
}

export default function App() {
  const [unit, setUnit] = useState<UnitSystem>('imperial');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [history, setHistory] = useState<BmiEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  const bmiResult = useMemo(() => {
    let hCm: number;
    let wKg: number;

    if (unit === 'imperial') {
      const ft = parseFloat(heightFt) || 0;
      const inches = parseFloat(heightIn) || 0;
      if (ft <= 0 && inches <= 0) return null;
      hCm = ftInToCm(ft, inches);
      wKg = lbsToKg(parseFloat(weightLbs) || 0);
    } else {
      hCm = parseFloat(heightCm) || 0;
      wKg = parseFloat(weightKg) || 0;
    }

    if (hCm <= 0 || wKg <= 0) return null;

    const bmi = calculateBmi(hCm, wKg);
    if (!isFinite(bmi) || bmi <= 0) return null;

    const category = getBmiCategory(bmi);
    const healthyRange = getHealthyWeightRange(hCm);

    return { bmi, category, healthyRange, heightCm: hCm, weightKg: wKg };
  }, [unit, heightFt, heightIn, heightCm, weightLbs, weightKg]);

  const handleSaveToHistory = useCallback(() => {
    if (!bmiResult) return;
    const entry: BmiEntry = {
      id: generateId(),
      bmi: Math.round(bmiResult.bmi * 10) / 10,
      category: bmiResult.category.label,
      heightCm: Math.round(bmiResult.heightCm * 10) / 10,
      weightKg: Math.round(bmiResult.weightKg * 10) / 10,
      date: new Date().toISOString().slice(0, 10),
    };
    const updated = [entry, ...history].slice(0, 50);
    setHistory(updated);
    saveHistory(updated);
    trackEvent('bmi_save');
  }, [bmiResult, history]);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return (
    <Layout title="BMI Calculator">
      <div className={styles.container}>
        {/* Unit Toggle */}
        <SegmentedControl
          options={[
            { label: 'Imperial (ft/lbs)', value: 'imperial' },
            { label: 'Metric (cm/kg)', value: 'metric' },
          ]}
          value={unit}
          onChange={(v) => setUnit(v as UnitSystem)}
        />

        {/* Height Input */}
        <Card>
          <div className={styles.inputSection}>
            <span className={styles.sectionLabel}>Height</span>
            {unit === 'imperial' ? (
              <div className={styles.inputRow}>
                <Input
                  label="Feet"
                  type="number"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  placeholder="5"
                  suffix="ft"
                  min="0"
                  max="9"
                  inputMode="numeric"
                />
                <Input
                  label="Inches"
                  type="number"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  placeholder="10"
                  suffix="in"
                  min="0"
                  max="11"
                  inputMode="numeric"
                />
              </div>
            ) : (
              <Input
                label="Centimeters"
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="178"
                suffix="cm"
                min="0"
                inputMode="decimal"
              />
            )}
          </div>
        </Card>

        {/* Weight Input */}
        <Card>
          <div className={styles.inputSection}>
            <span className={styles.sectionLabel}>Weight</span>
            {unit === 'imperial' ? (
              <Input
                label="Pounds"
                type="number"
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                placeholder="160"
                suffix="lbs"
                min="0"
                inputMode="decimal"
              />
            ) : (
              <Input
                label="Kilograms"
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="72"
                suffix="kg"
                min="0"
                inputMode="decimal"
              />
            )}
          </div>
        </Card>

        {/* Result */}
        {bmiResult && (
          <Card variant="glass" hoverable={false}>
            <div className={styles.resultSection}>
              <GaugeMeter bmi={bmiResult.bmi} />

              {/* BMI Scale Legend */}
              <div className={styles.scaleLegend}>
                {BMI_CATEGORIES.map((cat) => (
                  <div
                    key={cat.label}
                    className={`${styles.scaleItem} ${cat.label === bmiResult.category.label ? styles.scaleItemActive : ''}`}
                  >
                    <div className={styles.scaleDot} style={{ backgroundColor: cat.color }} />
                    <span className={styles.scaleLabel}>{cat.label}</span>
                    <span className={styles.scaleRange}>{cat.range}</span>
                  </div>
                ))}
              </div>

              {/* Healthy Weight Range */}
              <div className={styles.healthyRange}>
                <span className={styles.healthyTitle}>Healthy weight for your height</span>
                <span className={styles.healthyValues}>
                  {unit === 'imperial'
                    ? `${Math.round(kgToLbs(bmiResult.healthyRange.min))} – ${Math.round(kgToLbs(bmiResult.healthyRange.max))} lbs`
                    : `${bmiResult.healthyRange.min} – ${bmiResult.healthyRange.max} kg`}
                </span>
              </div>

              <Button
                variant="gradient"
                onClick={handleSaveToHistory}
                style={{ background: 'linear-gradient(135deg, #14b8a6, #22c55e)' }}
              >
                Save to History
              </Button>
            </div>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <div className={styles.historySection}>
              <div className={styles.historyHeader}>
                <button
                  className={styles.historyToggle}
                  onClick={() => setShowHistory((s) => !s)}
                >
                  <span className={styles.historyTitle}>
                    History ({history.length})
                  </span>
                  <span className={styles.historyChevron}>
                    {showHistory ? '\u25B2' : '\u25BC'}
                  </span>
                </button>
                {showHistory && (
                  <button className={styles.clearBtn} onClick={handleClearHistory}>
                    Clear
                  </button>
                )}
              </div>

              {showHistory && (
                <div className={styles.historyList}>
                  {/* Mini trend chart */}
                  {history.length >= 2 && (
                    <div className={styles.trendChart}>
                      <TrendChart entries={history.slice(0, 20).reverse()} />
                    </div>
                  )}

                  {history.slice(0, 20).map((entry) => {
                    const cat = getBmiCategory(entry.bmi);
                    return (
                      <div key={entry.id} className={styles.historyItem}>
                        <div className={styles.historyDot} style={{ backgroundColor: cat.color }} />
                        <div className={styles.historyInfo}>
                          <span className={styles.historyBmi}>{entry.bmi.toFixed(1)}</span>
                          <span className={styles.historyCat} style={{ color: cat.color }}>
                            {entry.category}
                          </span>
                        </div>
                        <span className={styles.historyDate}>{entry.date}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function TrendChart({ entries }: { entries: BmiEntry[] }) {
  if (entries.length < 2) return null;

  const width = 280;
  const height = 60;
  const padding = 4;

  const bmis = entries.map((e) => e.bmi);
  const min = Math.min(...bmis) - 1;
  const max = Math.max(...bmis) + 1;
  const range = max - min || 1;

  const points = entries.map((e, i) => {
    const x = padding + (i / (entries.length - 1)) * (width - padding * 2);
    const y = height - padding - ((e.bmi - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const lastEntry = entries[entries.length - 1];
  const color = getBmiCategory(lastEntry.bmi).color;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.trendSvg}>
      {/* Normal range band */}
      <rect
        x={padding}
        y={height - padding - ((25 - min) / range) * (height - padding * 2)}
        width={width - padding * 2}
        height={Math.abs(((25 - 18.5) / range) * (height - padding * 2))}
        fill="#22c55e"
        opacity="0.1"
        rx="3"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {entries.map((e, i) => {
        const [x, y] = points[i].split(',');
        return (
          <circle
            key={e.id}
            cx={x}
            cy={y}
            r="3"
            fill={getBmiCategory(e.bmi).color}
          />
        );
      })}
    </svg>
  );
}
