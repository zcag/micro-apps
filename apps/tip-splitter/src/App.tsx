import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

type SplitMode = 'even' | 'custom';
type TaxMode = 'included' | 'separate';

const TIP_PRESETS = [10, 15, 18, 20, 25];

interface SplitPerson {
  name: string;
  percent: number;
}

/** Animated count-up hook */
function useCountUp(target: number, duration = 500): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.005) {
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

function AnimatedCurrency({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>${animated.toFixed(2)}</>;
}

function formatCurrency(n: number): string {
  return '$' + n.toFixed(2);
}

export default function App() {
  const [billAmount, setBillAmount] = useState('');
  const [tipPercent, setTipPercent] = useState(18);
  const [customTip, setCustomTip] = useState('');
  const [isCustomTip, setIsCustomTip] = useState(false);
  const [numPeople, setNumPeople] = useState(2);
  const [roundUp, setRoundUp] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>('even');
  const [taxMode, setTaxMode] = useState<TaxMode>('included');
  const [taxAmount, setTaxAmount] = useState('');
  const [customSplits, setCustomSplits] = useState<SplitPerson[]>([]);

  // Sync custom splits when numPeople changes
  useEffect(() => {
    if (splitMode === 'custom') {
      setCustomSplits((prev) => {
        const next: SplitPerson[] = [];
        const evenPct = 100 / numPeople;
        for (let i = 0; i < numPeople; i++) {
          next.push({
            name: prev[i]?.name || `Person ${i + 1}`,
            percent: prev[i]?.percent ?? evenPct,
          });
        }
        return next;
      });
    }
  }, [numPeople, splitMode]);

  const activeTip = isCustomTip ? parseFloat(customTip) || 0 : tipPercent;
  const bill = parseFloat(billAmount) || 0;
  const tax = taxMode === 'separate' ? parseFloat(taxAmount) || 0 : 0;

  const tipValue = bill * (activeTip / 100);
  const totalWithTip = bill + tipValue + tax;

  const getPerPersonAmount = useCallback(
    (index?: number): number => {
      if (numPeople <= 0) return totalWithTip;
      if (splitMode === 'custom' && customSplits.length === numPeople && index !== undefined) {
        const pct = customSplits[index].percent / 100;
        const raw = totalWithTip * pct;
        return roundUp ? Math.ceil(raw) : raw;
      }
      const raw = totalWithTip / numPeople;
      return roundUp ? Math.ceil(raw) : raw;
    },
    [totalWithTip, numPeople, splitMode, customSplits, roundUp]
  );

  const perPerson = getPerPersonAmount();

  const handleTipPreset = (pct: number) => {
    setIsCustomTip(false);
    setTipPercent(pct);
    trackEvent('tip_preset', { percent: String(pct) });
  };

  const handleCustomTipChange = (val: string) => {
    setCustomTip(val);
    setIsCustomTip(true);
  };

  const handlePeopleChange = (delta: number) => {
    setNumPeople((p) => Math.max(1, Math.min(20, p + delta)));
  };

  const handleSliderChange = (index: number, newPercent: number) => {
    setCustomSplits((prev) => {
      const updated = [...prev];
      const old = updated[index].percent;
      const diff = newPercent - old;
      updated[index] = { ...updated[index], percent: newPercent };

      // Redistribute the difference among other sliders
      const others = updated.filter((_, i) => i !== index);
      const othersTotal = others.reduce((s, p) => s + p.percent, 0);
      if (othersTotal > 0) {
        for (let i = 0; i < updated.length; i++) {
          if (i !== index) {
            const ratio = updated[i].percent / othersTotal;
            updated[i] = {
              ...updated[i],
              percent: Math.max(0, updated[i].percent - diff * ratio),
            };
          }
        }
      }
      return updated;
    });
  };

  const resetSplits = () => {
    const evenPct = 100 / numPeople;
    setCustomSplits((prev) =>
      prev.map((p) => ({ ...p, percent: evenPct }))
    );
  };

  const hasBill = bill > 0;

  return (
    <Layout title="Tip Calculator">
      <div className={styles.container}>
        {/* Bill Input Section */}
        <div className={styles.heroSection}>
          <Card>
            {/* Tax mode toggle */}
            <div className={styles.taxToggle}>
              <SegmentedControl
                options={[
                  { label: 'Tax Included', value: 'included' as TaxMode },
                  { label: 'Add Tax', value: 'separate' as TaxMode },
                ]}
                value={taxMode}
                onChange={setTaxMode}
              />
            </div>

            {/* Bill amount */}
            <div className={styles.billSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>🧾</span>
                <span>Bill Amount</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.billInputWrapper}>
                <span className={styles.currencySymbol}>$</span>
                <input
                  className={styles.billInput}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Tax amount (separate) */}
            {taxMode === 'separate' && (
              <div className={styles.taxInputSection}>
                <Input
                  label="Tax Amount"
                  suffix="$"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </div>
            )}

            {/* Tip presets */}
            <div className={styles.tipSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>💰</span>
                <span>Tip Percentage</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.tipPresets}>
                {TIP_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`${styles.tipButton} ${
                      !isCustomTip && tipPercent === pct ? styles.tipButtonActive : ''
                    }`}
                    onClick={() => handleTipPreset(pct)}
                  >
                    {pct}%
                  </button>
                ))}
                <div className={styles.customTipWrapper}>
                  <input
                    className={`${styles.customTipInput} ${
                      isCustomTip ? styles.customTipInputActive : ''
                    }`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="Custom"
                    value={customTip}
                    onChange={(e) => handleCustomTipChange(e.target.value)}
                    onFocus={() => setIsCustomTip(true)}
                  />
                  <span className={styles.customTipSuffix}>%</span>
                </div>
              </div>
            </div>

            {/* Split between */}
            <div className={styles.splitSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>👥</span>
                <span>Split Between</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.peopleStepper}>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => handlePeopleChange(-1)}
                  disabled={numPeople <= 1}
                >
                  −
                </button>
                <div className={styles.stepperValue}>
                  <span className={styles.stepperNumber}>{numPeople}</span>
                  <span className={styles.stepperLabel}>
                    {numPeople === 1 ? 'person' : 'people'}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => handlePeopleChange(1)}
                  disabled={numPeople >= 20}
                >
                  +
                </button>
              </div>
            </div>

            {/* Split mode & round up */}
            <div className={styles.optionsRow}>
              <SegmentedControl
                options={[
                  { label: 'Even Split', value: 'even' as SplitMode },
                  { label: 'Custom Split', value: 'custom' as SplitMode },
                ]}
                value={splitMode}
                onChange={(v) => {
                  setSplitMode(v);
                  if (v === 'custom') {
                    const evenPct = 100 / numPeople;
                    setCustomSplits(
                      Array.from({ length: numPeople }, (_, i) => ({
                        name: `Person ${i + 1}`,
                        percent: evenPct,
                      }))
                    );
                  }
                }}
              />
              <button
                type="button"
                className={`${styles.roundUpToggle} ${roundUp ? styles.roundUpActive : ''}`}
                onClick={() => setRoundUp((r) => !r)}
              >
                <span className={styles.roundUpCheck}>{roundUp ? '✓' : ''}</span>
                Round up
              </button>
            </div>
          </Card>
        </div>

        {/* Custom split sliders */}
        {splitMode === 'custom' && hasBill && (
          <div className={styles.customSplitSection}>
            <Card>
              <div className={styles.customSplitHeader}>
                <span className={styles.sectionHeader}>
                  <span className={styles.sectionHeaderIcon}>⚖️</span>
                  <span>Custom Split</span>
                  <span className={styles.sectionDivider} />
                </span>
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={resetSplits}
                >
                  Reset
                </button>
              </div>
              <div className={styles.sliderList}>
                {customSplits.map((person, i) => (
                  <div key={i} className={styles.sliderRow}>
                    <div className={styles.sliderLabel}>
                      <span className={styles.personBadge}>{i + 1}</span>
                      <span>{person.name}</span>
                    </div>
                    <input
                      type="range"
                      className={styles.slider}
                      min="0"
                      max="100"
                      step="1"
                      value={person.percent}
                      onChange={(e) => handleSliderChange(i, parseFloat(e.target.value))}
                    />
                    <div className={styles.sliderValues}>
                      <span className={styles.sliderPercent}>
                        {person.percent.toFixed(0)}%
                      </span>
                      <span className={styles.sliderAmount}>
                        {formatCurrency(totalWithTip * (person.percent / 100))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Results divider */}
        {hasBill && (
          <div className={styles.resultsDivider}>
            <span className={styles.resultsDividerLine} />
            <span className={styles.resultsDividerIcon}>▼</span>
            <span className={styles.resultsDividerLine} />
          </div>
        )}

        {/* Results */}
        {hasBill ? (
          <div className={styles.resultsContainer}>
            {/* Per person - primary result */}
            <div className={styles.primaryResult}>
              <div className={styles.primaryResultLabel}>Per Person</div>
              <div className={styles.primaryResultValue}>
                <AnimatedCurrency value={perPerson} />
              </div>
              <div className={styles.primaryResultUnit}>
                each {roundUp && '(rounded up)'}
              </div>
            </div>

            {/* Breakdown */}
            <div className={styles.breakdownGrid}>
              <div className={styles.breakdownCard}>
                <div className={styles.breakdownEmoji}>💵</div>
                <div className={styles.breakdownValue}>
                  <AnimatedCurrency value={tipValue} />
                </div>
                <div className={styles.breakdownLabel}>Tip Amount</div>
              </div>
              <div className={styles.breakdownCard}>
                <div className={styles.breakdownEmoji}>🧾</div>
                <div className={styles.breakdownValue}>
                  <AnimatedCurrency value={totalWithTip} />
                </div>
                <div className={styles.breakdownLabel}>Total</div>
              </div>
              {taxMode === 'separate' && tax > 0 && (
                <div className={styles.breakdownCard}>
                  <div className={styles.breakdownEmoji}>🏛️</div>
                  <div className={styles.breakdownValue}>
                    <AnimatedCurrency value={tax} />
                  </div>
                  <div className={styles.breakdownLabel}>Tax</div>
                </div>
              )}
              <div className={styles.breakdownCard}>
                <div className={styles.breakdownEmoji}>📊</div>
                <div className={styles.breakdownValue}>{activeTip}%</div>
                <div className={styles.breakdownLabel}>Tip Rate</div>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🍽️</div>
              <div className={styles.emptyStateText}>Enter your bill to get started</div>
              <div className={styles.emptyStateHint}>
                Pick a tip percentage and split the bill
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
