import { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  ResultDisplay,
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

const PRESETS: { label: string; dims: Dimensions }[] = [
  { label: 'Sidewalk (4ft × 20ft × 4in)', dims: { length: '4', width: '20', depth: '0.333' } },
  { label: 'Patio (10ft × 10ft × 4in)', dims: { length: '10', width: '10', depth: '0.333' } },
  { label: 'Footing (2ft × 2ft × 1ft)', dims: { length: '2', width: '2', depth: '1' } },
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
    // Input in meters, convert to cubic ft for bag calculations
    cubicFt = l * w * d * 35.3147; // 1 m³ = 35.3147 ft³
  }

  const cubicYards = cubicFt / 27;
  const cubicMeters = cubicFt * 0.0283168;
  const bags60 = Math.ceil(cubicFt / 0.45);
  const bags80 = Math.ceil(cubicFt / 0.6);

  return { cubicYards, cubicMeters, bags60, bags80 };
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

  // Recalculate when restored from localStorage
  useEffect(() => {
    if (saved && dims.length && dims.width && dims.depth) {
      setResults(calculate(dims, unit));
    }
    // Only on mount
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
    // Presets are in imperial (ft)
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

  return (
    <Layout title="Concrete Calculator">
      <div className={styles.container}>
        <Card>
          <div className={styles.section}>
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

          <div className={styles.section}>
            <label className={styles.selectLabel}>Common Presets</label>
            <select
              className={styles.select}
              value=""
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (!isNaN(idx)) handlePreset(PRESETS[idx]);
              }}
            >
              <option value="">Select a preset...</option>
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.inputs}>
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

          <Button onClick={handleCalculate} haptic>
            Calculate
          </Button>
        </Card>

        {results && (
          <Card style={{ marginTop: '16px' }}>
            <div className={styles.results}>
              {unit === 'imperial' && (
                <ResultDisplay
                  label="Volume"
                  value={results.cubicYards.toFixed(2)}
                  unit="cubic yards"
                />
              )}
              <ResultDisplay
                label="Volume"
                value={results.cubicMeters.toFixed(2)}
                unit="cubic meters"
              />
              <ResultDisplay label="60lb Bags Needed" value={results.bags60} unit="bags" />
              <ResultDisplay label="80lb Bags Needed" value={results.bags80} unit="bags" />
              <Button variant="secondary" onClick={handleCopyAll}>
                {copied ? 'Copied!' : 'Copy All Results'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
