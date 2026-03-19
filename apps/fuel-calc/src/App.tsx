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

interface FuelInputs {
  distance: string;
  efficiency: string;
  fuelPrice: string;
}

interface Results {
  fuelGallons: number;
  fuelLiters: number;
  totalCost: number;
  costPerMile: number;
  costPerKm: number;
}

interface SavedCalc {
  inputs: FuelInputs;
  unit: UnitSystem;
  roundTrip: boolean;
  results: Results;
  timestamp: number;
}

const VEHICLE_PRESETS: { label: string; emoji: string; mpg: number }[] = [
  { label: 'Sedan', emoji: '🚗', mpg: 30 },
  { label: 'SUV', emoji: '🚙', mpg: 22 },
  { label: 'Truck', emoji: '🛻', mpg: 18 },
  { label: 'Hybrid', emoji: '🔋', mpg: 45 },
];

const STORAGE_KEY = 'fuel-calc-last';
const HISTORY_KEY = 'fuel-calc-history';
const MAX_HISTORY = 5;

function loadSaved(): (FuelInputs & { unit: UnitSystem; roundTrip: boolean }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadHistory(): SavedCalc[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(calc: SavedCalc) {
  const history = loadHistory();
  history.unshift(calc);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function calculate(inputs: FuelInputs, unit: UnitSystem, roundTrip: boolean): Results | null {
  const dist = parseFloat(inputs.distance);
  const eff = parseFloat(inputs.efficiency);
  const price = parseFloat(inputs.fuelPrice);
  if (isNaN(dist) || isNaN(eff) || isNaN(price) || dist <= 0 || eff <= 0 || price <= 0) return null;

  const actualDistance = roundTrip ? dist * 2 : dist;

  let fuelGallons: number;
  let fuelLiters: number;
  let totalCost: number;

  if (unit === 'imperial') {
    // distance in miles, efficiency in MPG, price per gallon
    fuelGallons = actualDistance / eff;
    fuelLiters = fuelGallons * 3.78541;
    totalCost = fuelGallons * price;
  } else {
    // distance in km, efficiency in L/100km, price per liter
    fuelLiters = (actualDistance / 100) * eff;
    fuelGallons = fuelLiters / 3.78541;
    totalCost = fuelLiters * price;
  }

  const distMiles = unit === 'imperial' ? actualDistance : actualDistance * 0.621371;
  const distKm = unit === 'metric' ? actualDistance : actualDistance * 1.60934;

  return {
    fuelGallons,
    fuelLiters,
    totalCost,
    costPerMile: distMiles > 0 ? totalCost / distMiles : 0,
    costPerKm: distKm > 0 ? totalCost / distKm : 0,
  };
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

export default function App() {
  const saved = loadSaved();
  const [unit, setUnit] = useState<UnitSystem>(saved?.unit ?? 'imperial');
  const [roundTrip, setRoundTrip] = useState(saved?.roundTrip ?? false);
  const [inputs, setInputs] = useState<FuelInputs>({
    distance: saved?.distance ?? '',
    efficiency: saved?.efficiency ?? '',
    fuelPrice: saved?.fuelPrice ?? '',
  });
  const [results, setResults] = useState<Results | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<SavedCalc[]>(loadHistory);

  useEffect(() => {
    if (saved && inputs.distance && inputs.efficiency && inputs.fuelPrice) {
      setResults(calculate(inputs, unit, roundTrip));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCalculate = () => {
    const r = calculate(inputs, unit, roundTrip);
    setResults(r);
    if (r) {
      trackEvent('calculate', { unit, roundTrip: String(roundTrip) });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...inputs, unit, roundTrip }));
      const calc: SavedCalc = { inputs, unit, roundTrip, results: r, timestamp: Date.now() };
      saveHistory(calc);
      setHistory(loadHistory());
    }
  };

  const handlePreset = (preset: (typeof VEHICLE_PRESETS)[number]) => {
    if (unit === 'imperial') {
      setInputs({ ...inputs, efficiency: String(preset.mpg) });
    } else {
      // Convert MPG to L/100km: L/100km = 235.215 / MPG
      const l100km = (235.215 / preset.mpg).toFixed(1);
      setInputs({ ...inputs, efficiency: l100km });
    }
    setResults(null);
  };

  const handleLoadHistory = (calc: SavedCalc) => {
    setUnit(calc.unit);
    setRoundTrip(calc.roundTrip);
    setInputs(calc.inputs);
    setResults(calc.results);
  };

  const handleCopyAll = () => {
    if (!results) return;
    const distLabel = unit === 'imperial' ? 'miles' : 'km';
    const actualDist = roundTrip
      ? `${parseFloat(inputs.distance) * 2} ${distLabel} (round trip)`
      : `${inputs.distance} ${distLabel}`;
    const lines = [
      `Trip: ${actualDist}`,
      `Fuel needed: ${results.fuelGallons.toFixed(2)} gal / ${results.fuelLiters.toFixed(2)} L`,
      `Total cost: $${results.totalCost.toFixed(2)}`,
      `Cost per mile: $${results.costPerMile.toFixed(3)}`,
      `Cost per km: $${results.costPerKm.toFixed(3)}`,
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const distSuffix = unit === 'imperial' ? 'mi' : 'km';
  const effSuffix = unit === 'imperial' ? 'MPG' : 'L/100km';
  const priceSuffix = unit === 'imperial' ? '$/gal' : '$/L';
  const hasValidInputs = inputs.distance && inputs.efficiency && inputs.fuelPrice &&
    parseFloat(inputs.distance) > 0 && parseFloat(inputs.efficiency) > 0 && parseFloat(inputs.fuelPrice) > 0;

  return (
    <Layout title="Fuel Cost Calculator">
      <div className={styles.container}>
        <div className={styles.heroSection}>
          <Card>
            {/* Unit toggle */}
            <div className={styles.unitSection}>
              <SegmentedControl
                options={[
                  { label: 'Imperial (mi)', value: 'imperial' },
                  { label: 'Metric (km)', value: 'metric' },
                ]}
                value={unit}
                onChange={(v) => {
                  setUnit(v);
                  setResults(null);
                }}
              />
            </div>

            {/* Vehicle presets */}
            <div className={styles.presetSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>🚗</span>
                <span>Vehicle Presets</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.presetChips}>
                {VEHICLE_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={styles.presetChip}
                    onClick={() => handlePreset(p)}
                    type="button"
                  >
                    <span className={styles.presetEmoji}>{p.emoji}</span>
                    {p.label}
                    <span className={styles.presetMpg}>
                      {unit === 'imperial' ? `${p.mpg}mpg` : `${(235.215 / p.mpg).toFixed(1)}L`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Trip inputs */}
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                ⛽ Trip Details
              </div>
              <div className={styles.inputFields}>
                <Input
                  label="Distance"
                  suffix={distSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={inputs.distance}
                  onChange={(e) => setInputs({ ...inputs, distance: e.target.value })}
                />
                <Input
                  label="Fuel Efficiency"
                  suffix={effSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={inputs.efficiency}
                  onChange={(e) => setInputs({ ...inputs, efficiency: e.target.value })}
                />
                <Input
                  label="Fuel Price"
                  suffix={priceSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={inputs.fuelPrice}
                  onChange={(e) => setInputs({ ...inputs, fuelPrice: e.target.value })}
                />
              </div>
            </div>

            {/* Round trip toggle */}
            <button
              className={`${styles.roundTripToggle} ${roundTrip ? styles.roundTripActive : ''}`}
              onClick={() => {
                setRoundTrip(!roundTrip);
                setResults(null);
              }}
              type="button"
            >
              <span className={styles.roundTripCheck}>{roundTrip ? '✓' : ''}</span>
              <span>🔄 Round trip (doubles distance)</span>
            </button>

            {/* Valid indicator */}
            {hasValidInputs && !results && (
              <div className={styles.validIndicator}>
                ✓ Ready to calculate
              </div>
            )}

            <div className={styles.calculateArea}>
              <Button variant="gradient" onClick={handleCalculate} haptic>
                Calculate Fuel Cost
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
              <div className={styles.primaryResultLabel}>Total Trip Cost</div>
              <div className={styles.primaryResultValue}>
                $<AnimatedValue value={results.totalCost} />
              </div>
              <div className={styles.primaryResultUnit}>
                {roundTrip ? 'round trip' : 'one way'}
              </div>
            </div>

            {/* Secondary results grid */}
            <div className={styles.secondaryResults}>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>⛽</div>
                <div className={styles.secondaryCardValue}>
                  <AnimatedValue value={results.fuelGallons} />
                </div>
                <div className={styles.secondaryCardLabel}>Gallons</div>
              </div>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>⛽</div>
                <div className={styles.secondaryCardValue}>
                  <AnimatedValue value={results.fuelLiters} />
                </div>
                <div className={styles.secondaryCardLabel}>Liters</div>
              </div>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>📍</div>
                <div className={styles.secondaryCardValue}>
                  $<AnimatedValue value={results.costPerMile} decimals={3} />
                </div>
                <div className={styles.secondaryCardLabel}>Per Mile</div>
              </div>
              <div className={styles.secondaryCard}>
                <div className={styles.secondaryCardEmoji}>📍</div>
                <div className={styles.secondaryCardValue}>
                  $<AnimatedValue value={results.costPerKm} decimals={3} />
                </div>
                <div className={styles.secondaryCardLabel}>Per Km</div>
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
              <div className={styles.emptyStateIcon}>⛽</div>
              <div className={styles.emptyStateText}>Enter trip details to calculate</div>
              <div className={styles.emptyStateHint}>
                or pick a vehicle preset above to get started
              </div>
            </div>
          </Card>
        )}

        {/* Recent calculations */}
        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionHeaderIcon}>🕐</span>
              <span>Recent Calculations</span>
              <span className={styles.sectionDivider} />
            </div>
            <div className={styles.historyList}>
              {history.map((calc, i) => {
                const distLabel = calc.unit === 'imperial' ? 'mi' : 'km';
                const dist = parseFloat(calc.inputs.distance) * (calc.roundTrip ? 2 : 1);
                return (
                  <button
                    key={calc.timestamp}
                    className={styles.historyItem}
                    onClick={() => handleLoadHistory(calc)}
                    type="button"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <div className={styles.historyItemTop}>
                      <span className={styles.historyDist}>
                        {dist} {distLabel}
                        {calc.roundTrip ? ' ↔' : ''}
                      </span>
                      <span className={styles.historyCost}>
                        ${calc.results.totalCost.toFixed(2)}
                      </span>
                    </div>
                    <div className={styles.historyItemBottom}>
                      {new Date(calc.timestamp).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
