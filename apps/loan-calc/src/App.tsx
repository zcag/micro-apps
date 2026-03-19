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

type ViewMode = 'calculator' | 'compare';
type TermUnit = 'years' | 'months';

interface LoanResult {
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  principalPercent: number;
  interestPercent: number;
}

interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

interface ExtraPaymentResult {
  newMonthlyPayment: number;
  monthsSaved: number;
  interestSaved: number;
  newTotalInterest: number;
  newTotalPaid: number;
  newTermMonths: number;
}

/* ─── Math helpers ─── */

function calculateLoan(
  principal: number,
  annualRate: number,
  termMonths: number
): LoanResult | null {
  if (principal <= 0 || termMonths <= 0) return null;
  if (annualRate <= 0) {
    const monthlyPayment = principal / termMonths;
    return {
      monthlyPayment,
      totalInterest: 0,
      totalPaid: principal,
      principalPercent: 100,
      interestPercent: 0,
    };
  }
  const r = annualRate / 100 / 12;
  const n = termMonths;
  const factor = Math.pow(1 + r, n);
  const monthlyPayment = (principal * r * factor) / (factor - 1);
  const totalPaid = monthlyPayment * n;
  const totalInterest = totalPaid - principal;
  const principalPercent = (principal / totalPaid) * 100;
  const interestPercent = (totalInterest / totalPaid) * 100;
  return { monthlyPayment, totalInterest, totalPaid, principalPercent, interestPercent };
}

function calculateAmortization(
  principal: number,
  annualRate: number,
  termMonths: number,
  extraPayment: number = 0
): AmortizationRow[] {
  if (principal <= 0 || termMonths <= 0) return [];
  const r = annualRate / 100 / 12;
  const result = calculateLoan(principal, annualRate, termMonths);
  if (!result) return [];
  const basePayment = result.monthlyPayment;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let month = 1; month <= termMonths && balance > 0.01; month++) {
    const interest = balance * r;
    const totalPayment = Math.min(basePayment + extraPayment, balance + interest);
    const principalPaid = totalPayment - interest;
    balance = Math.max(0, balance - principalPaid);
    rows.push({
      month,
      payment: totalPayment,
      principal: principalPaid,
      interest,
      balance,
    });
  }
  return rows;
}

function calculateExtraPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
  extraMonthly: number
): ExtraPaymentResult | null {
  const base = calculateLoan(principal, annualRate, termMonths);
  if (!base || extraMonthly <= 0) return null;
  const schedule = calculateAmortization(principal, annualRate, termMonths, extraMonthly);
  const newTermMonths = schedule.length;
  const newTotalPaid = schedule.reduce((s, r) => s + r.payment, 0);
  const newTotalInterest = newTotalPaid - principal;
  return {
    newMonthlyPayment: base.monthlyPayment + extraMonthly,
    monthsSaved: termMonths - newTermMonths,
    interestSaved: base.totalInterest - newTotalInterest,
    newTotalInterest,
    newTotalPaid,
    newTermMonths,
  };
}

/* ─── Animated count-up ─── */

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
  return <>${animated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
}

function AnimatedInt({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{Math.round(animated)}</>;
}

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Donut Chart ─── */

function DonutChart({
  principalPercent,
  interestPercent,
}: {
  principalPercent: number;
  interestPercent: number;
}) {
  const animatedPrincipal = useCountUp(principalPercent, 800);
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const principalArc = (animatedPrincipal / 100) * circumference;
  const interestArc = circumference - principalArc;

  return (
    <div className={styles.donutWrapper}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={styles.donutSvg}
      >
        {/* Interest arc (background) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="color-mix(in srgb, #ef4444 60%, var(--bg-secondary))"
          strokeWidth={strokeWidth}
          strokeDasharray={`${interestArc} ${principalArc}`}
          strokeDashoffset={-principalArc}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        {/* Principal arc (foreground) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#principalGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${principalArc} ${circumference - principalArc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <defs>
          <linearGradient id="principalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      <div className={styles.donutCenter}>
        <div className={styles.donutCenterLabel}>Principal</div>
        <div className={styles.donutCenterValue}>
          <AnimatedInt value={principalPercent} />%
        </div>
      </div>
      <div className={styles.donutLegend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'linear-gradient(135deg, #059669, #34d399)' }} />
          <span>Principal</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#ef4444' }} />
          <span>Interest</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Loan Panel (used in both single and compare modes) ─── */

function LoanPanel({
  label,
  amount,
  setAmount,
  rate,
  setRate,
  termValue,
  setTermValue,
  termUnit,
  setTermUnit,
  extraPayment,
  setExtraPayment,
  showExtra,
  compact,
}: {
  label?: string;
  amount: string;
  setAmount: (v: string) => void;
  rate: string;
  setRate: (v: string) => void;
  termValue: string;
  setTermValue: (v: string) => void;
  termUnit: TermUnit;
  setTermUnit: (v: TermUnit) => void;
  extraPayment: string;
  setExtraPayment: (v: string) => void;
  showExtra: boolean;
  compact?: boolean;
}) {
  const termMonths =
    termUnit === 'years'
      ? (parseFloat(termValue) || 0) * 12
      : parseFloat(termValue) || 0;

  return (
    <div className={compact ? styles.compactPanel : undefined}>
      {label && (
        <div className={styles.panelLabel}>{label}</div>
      )}

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>🏠</span>
          <span>Loan Amount</span>
          <span className={styles.sectionDivider} />
        </div>
        <div className={styles.sliderInputRow}>
          <div className={styles.sliderInputField}>
            <Input
              label=""
              suffix="$"
              type="number"
              inputMode="decimal"
              min="0"
              step="1000"
              placeholder="250,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <input
            type="range"
            className={styles.rangeSlider}
            min="10000"
            max="2000000"
            step="5000"
            value={parseFloat(amount) || 250000}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>📊</span>
          <span>Interest Rate</span>
          <span className={styles.sectionDivider} />
        </div>
        <div className={styles.sliderInputRow}>
          <div className={styles.sliderInputField}>
            <Input
              label=""
              suffix="%"
              type="number"
              inputMode="decimal"
              min="0"
              max="30"
              step="0.125"
              placeholder="6.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <input
            type="range"
            className={styles.rangeSlider}
            min="0.5"
            max="15"
            step="0.125"
            value={parseFloat(rate) || 6.5}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>📅</span>
          <span>Loan Term</span>
          <span className={styles.sectionDivider} />
        </div>
        <div className={styles.termRow}>
          <div className={styles.termInput}>
            <Input
              label=""
              suffix={termUnit === 'years' ? 'yr' : 'mo'}
              type="number"
              inputMode="numeric"
              min="1"
              value={termValue}
              onChange={(e) => setTermValue(e.target.value)}
            />
          </div>
          <SegmentedControl
            options={[
              { label: 'Years', value: 'years' as TermUnit },
              { label: 'Months', value: 'months' as TermUnit },
            ]}
            value={termUnit}
            onChange={setTermUnit}
          />
        </div>
        {!compact && (
          <div className={styles.presetChips}>
            {[
              { label: '15 yr', years: 15 },
              { label: '20 yr', years: 20 },
              { label: '30 yr', years: 30 },
            ].map((preset) => (
              <button
                key={preset.years}
                type="button"
                className={`${styles.presetChip} ${
                  termUnit === 'years' && termValue === String(preset.years)
                    ? styles.presetChipActive
                    : ''
                }`}
                onClick={() => {
                  setTermUnit('years');
                  setTermValue(String(preset.years));
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showExtra && (
        <div className={styles.inputGroup}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>💸</span>
            <span>Extra Monthly Payment</span>
            <span className={styles.sectionDivider} />
          </div>
          <Input
            label=""
            suffix="$/mo"
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            placeholder="0"
            value={extraPayment}
            onChange={(e) => setExtraPayment(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Main App ─── */

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('calculator');

  // Primary loan
  const [amount, setAmount] = useState('250000');
  const [rate, setRate] = useState('6.5');
  const [termValue, setTermValue] = useState('30');
  const [termUnit, setTermUnit] = useState<TermUnit>('years');
  const [extraPayment, setExtraPayment] = useState('');
  const [showAmortization, setShowAmortization] = useState(false);
  const [amortizationPage, setAmortizationPage] = useState(0);

  // Compare loan
  const [amount2, setAmount2] = useState('250000');
  const [rate2, setRate2] = useState('6.5');
  const [termValue2, setTermValue2] = useState('15');
  const [termUnit2, setTermUnit2] = useState<TermUnit>('years');
  const [extraPayment2, setExtraPayment2] = useState('');

  const getTermMonths = useCallback(
    (tv: string, tu: TermUnit) =>
      tu === 'years' ? (parseFloat(tv) || 0) * 12 : parseFloat(tv) || 0,
    []
  );

  const termMonths1 = getTermMonths(termValue, termUnit);
  const principal1 = parseFloat(amount) || 0;
  const annualRate1 = parseFloat(rate) || 0;
  const extra1 = parseFloat(extraPayment) || 0;
  const result1 = calculateLoan(principal1, annualRate1, termMonths1);

  const termMonths2 = getTermMonths(termValue2, termUnit2);
  const principal2 = parseFloat(amount2) || 0;
  const annualRate2 = parseFloat(rate2) || 0;
  const result2 = calculateLoan(principal2, annualRate2, termMonths2);

  const extraResult1 =
    extra1 > 0
      ? calculateExtraPayment(principal1, annualRate1, termMonths1, extra1)
      : null;

  const amortization = calculateAmortization(
    principal1,
    annualRate1,
    termMonths1,
    extra1
  );

  const ROWS_PER_PAGE = 24;
  const totalPages = Math.ceil(amortization.length / ROWS_PER_PAGE);
  const visibleAmortization = amortization.slice(
    amortizationPage * ROWS_PER_PAGE,
    (amortizationPage + 1) * ROWS_PER_PAGE
  );

  const handlePresetCompare = (preset: '15v30' | '20v30') => {
    setViewMode('compare');
    if (preset === '15v30') {
      setTermValue('30');
      setTermUnit('years');
      setTermValue2('15');
      setTermUnit2('years');
    } else {
      setTermValue('30');
      setTermUnit('years');
      setTermValue2('20');
      setTermUnit2('years');
    }
    // Sync amounts and rates
    setAmount2(amount);
    setRate2(rate);
    trackEvent('preset_compare', { preset });
  };

  const hasResult = result1 !== null;

  return (
    <Layout title="Loan Calculator">
      <div className={styles.container}>
        {/* Mode toggle */}
        <div className={styles.modeToggle}>
          <SegmentedControl
            options={[
              { label: '🧮 Calculator', value: 'calculator' as ViewMode },
              { label: '⚖️ Compare', value: 'compare' as ViewMode },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
        </div>

        {viewMode === 'calculator' ? (
          <>
            {/* Input section */}
            <div className={styles.heroSection}>
              <Card>
                <LoanPanel
                  amount={amount}
                  setAmount={setAmount}
                  rate={rate}
                  setRate={setRate}
                  termValue={termValue}
                  setTermValue={setTermValue}
                  termUnit={termUnit}
                  setTermUnit={setTermUnit}
                  extraPayment={extraPayment}
                  setExtraPayment={setExtraPayment}
                  showExtra={true}
                />
              </Card>
            </div>

            {/* Quick compare presets */}
            <div className={styles.quickCompare}>
              <span className={styles.quickCompareLabel}>Quick Compare:</span>
              <button
                type="button"
                className={styles.quickCompareButton}
                onClick={() => handlePresetCompare('15v30')}
              >
                15 vs 30 Year
              </button>
              <button
                type="button"
                className={styles.quickCompareButton}
                onClick={() => handlePresetCompare('20v30')}
              >
                20 vs 30 Year
              </button>
            </div>

            {/* Results */}
            {hasResult ? (
              <>
                <div className={styles.resultsDivider}>
                  <span className={styles.resultsDividerLine} />
                  <span className={styles.resultsDividerIcon}>▼</span>
                  <span className={styles.resultsDividerLine} />
                </div>

                <div className={styles.resultsContainer}>
                  {/* Primary result */}
                  <div className={styles.primaryResult}>
                    <div className={styles.primaryResultLabel}>Monthly Payment</div>
                    <div className={styles.primaryResultValue}>
                      <AnimatedCurrency value={extraResult1 ? extraResult1.newMonthlyPayment : result1!.monthlyPayment} />
                    </div>
                    {extraResult1 && (
                      <div className={styles.primaryResultNote}>
                        (base {formatCurrency(result1!.monthlyPayment)} + {formatCurrency(extra1)} extra)
                      </div>
                    )}
                  </div>

                  {/* Breakdown cards */}
                  <div className={styles.breakdownGrid}>
                    <div className={styles.breakdownCard}>
                      <div className={styles.breakdownEmoji}>💰</div>
                      <div className={styles.breakdownValue}>
                        <AnimatedCurrency value={extraResult1 ? extraResult1.newTotalInterest : result1!.totalInterest} />
                      </div>
                      <div className={styles.breakdownLabel}>Total Interest</div>
                    </div>
                    <div className={styles.breakdownCard}>
                      <div className={styles.breakdownEmoji}>🏦</div>
                      <div className={styles.breakdownValue}>
                        <AnimatedCurrency value={extraResult1 ? extraResult1.newTotalPaid : result1!.totalPaid} />
                      </div>
                      <div className={styles.breakdownLabel}>Total Paid</div>
                    </div>
                  </div>

                  {/* Extra payment savings */}
                  {extraResult1 && (
                    <div className={styles.savingsCard}>
                      <div className={styles.savingsHeader}>
                        <span className={styles.savingsIcon}>🎉</span>
                        <span>Extra Payment Savings</span>
                      </div>
                      <div className={styles.savingsGrid}>
                        <div className={styles.savingsItem}>
                          <div className={styles.savingsItemValue}>
                            <AnimatedCurrency value={extraResult1.interestSaved} />
                          </div>
                          <div className={styles.savingsItemLabel}>Interest Saved</div>
                        </div>
                        <div className={styles.savingsItem}>
                          <div className={styles.savingsItemValue}>
                            <AnimatedInt value={Math.floor(extraResult1.monthsSaved / 12)} /> yr{' '}
                            <AnimatedInt value={extraResult1.monthsSaved % 12} /> mo
                          </div>
                          <div className={styles.savingsItemLabel}>Time Saved</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Donut chart */}
                  <Card>
                    <div className={styles.chartSection}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionHeaderIcon}>📈</span>
                        <span>Payment Breakdown</span>
                        <span className={styles.sectionDivider} />
                      </div>
                      <DonutChart
                        principalPercent={result1!.principalPercent}
                        interestPercent={result1!.interestPercent}
                      />
                    </div>
                  </Card>

                  {/* Amortization schedule */}
                  <Card>
                    <button
                      type="button"
                      className={styles.amortizationToggle}
                      onClick={() => {
                        setShowAmortization((s) => !s);
                        setAmortizationPage(0);
                        if (!showAmortization) {
                          trackEvent('view_amortization', {});
                        }
                      }}
                    >
                      <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                        <span className={styles.sectionHeaderIcon}>📋</span>
                        <span>Amortization Schedule</span>
                        <span className={styles.sectionDivider} />
                      </div>
                      <span
                        className={`${styles.chevron} ${
                          showAmortization ? styles.chevronOpen : ''
                        }`}
                      >
                        ▾
                      </span>
                    </button>

                    {showAmortization && (
                      <div className={styles.amortizationTable}>
                        <div className={styles.tableHeader}>
                          <span className={styles.tableHeaderCell}>Mo</span>
                          <span className={styles.tableHeaderCell}>Payment</span>
                          <span className={styles.tableHeaderCell}>Principal</span>
                          <span className={styles.tableHeaderCell}>Interest</span>
                          <span className={styles.tableHeaderCell}>Balance</span>
                        </div>
                        {visibleAmortization.map((row) => (
                          <div
                            key={row.month}
                            className={`${styles.tableRow} ${
                              row.month % 2 === 0 ? styles.tableRowEven : ''
                            }`}
                          >
                            <span className={styles.tableCell}>{row.month}</span>
                            <span className={styles.tableCell}>
                              {formatCurrency(row.payment)}
                            </span>
                            <span className={`${styles.tableCell} ${styles.principalCell}`}>
                              {formatCurrency(row.principal)}
                            </span>
                            <span className={`${styles.tableCell} ${styles.interestCell}`}>
                              {formatCurrency(row.interest)}
                            </span>
                            <span className={styles.tableCell}>
                              {formatCurrency(row.balance)}
                            </span>
                          </div>
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className={styles.pagination}>
                            <button
                              type="button"
                              className={styles.pageButton}
                              disabled={amortizationPage === 0}
                              onClick={() => setAmortizationPage((p) => p - 1)}
                            >
                              ← Prev
                            </button>
                            <span className={styles.pageInfo}>
                              {amortizationPage + 1} / {totalPages}
                            </span>
                            <button
                              type="button"
                              className={styles.pageButton}
                              disabled={amortizationPage >= totalPages - 1}
                              onClick={() => setAmortizationPage((p) => p + 1)}
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              </>
            ) : (
              <Card>
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>🏡</div>
                  <div className={styles.emptyStateText}>
                    Enter loan details to calculate
                  </div>
                  <div className={styles.emptyStateHint}>
                    Monthly payment, total interest, and amortization schedule
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : (
          /* ─── Compare Mode ─── */
          <>
            <div className={styles.compareContainer}>
              <div className={styles.comparePanel}>
                <div className={styles.heroSection}>
                  <Card>
                    <LoanPanel
                      label="Scenario A"
                      amount={amount}
                      setAmount={setAmount}
                      rate={rate}
                      setRate={setRate}
                      termValue={termValue}
                      setTermValue={setTermValue}
                      termUnit={termUnit}
                      setTermUnit={setTermUnit}
                      extraPayment={extraPayment}
                      setExtraPayment={setExtraPayment}
                      showExtra={false}
                      compact
                    />
                  </Card>
                </div>

                {result1 && (
                  <div className={styles.compareResult}>
                    <div className={styles.compareResultValue}>
                      <AnimatedCurrency value={result1.monthlyPayment} />
                    </div>
                    <div className={styles.compareResultLabel}>/ month</div>
                    <div className={styles.compareResultDetail}>
                      Total: {formatCurrency(result1.totalPaid)}
                    </div>
                    <div className={styles.compareResultDetail}>
                      Interest: {formatCurrency(result1.totalInterest)}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.compareDivider}>
                <span className={styles.compareDividerText}>VS</span>
              </div>

              <div className={styles.comparePanel}>
                <div className={styles.heroSection}>
                  <Card>
                    <LoanPanel
                      label="Scenario B"
                      amount={amount2}
                      setAmount={setAmount2}
                      rate={rate2}
                      setRate={setRate2}
                      termValue={termValue2}
                      setTermValue={setTermValue2}
                      termUnit={termUnit2}
                      setTermUnit={setTermUnit2}
                      extraPayment={extraPayment2}
                      setExtraPayment={setExtraPayment2}
                      showExtra={false}
                      compact
                    />
                  </Card>
                </div>

                {result2 && (
                  <div className={styles.compareResult}>
                    <div className={styles.compareResultValue}>
                      <AnimatedCurrency value={result2.monthlyPayment} />
                    </div>
                    <div className={styles.compareResultLabel}>/ month</div>
                    <div className={styles.compareResultDetail}>
                      Total: {formatCurrency(result2.totalPaid)}
                    </div>
                    <div className={styles.compareResultDetail}>
                      Interest: {formatCurrency(result2.totalInterest)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Compare summary */}
            {result1 && result2 && (
              <div className={styles.compareSummary}>
                <Card>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionHeaderIcon}>📊</span>
                    <span>Comparison Summary</span>
                    <span className={styles.sectionDivider} />
                  </div>
                  <div className={styles.compareSummaryGrid}>
                    <div className={styles.compareSummaryRow}>
                      <span className={styles.compareSummaryLabel}>Monthly Difference</span>
                      <span className={styles.compareSummaryValue}>
                        {formatCurrency(Math.abs(result1.monthlyPayment - result2.monthlyPayment))}
                        <span className={styles.compareSummaryHint}>
                          {result1.monthlyPayment > result2.monthlyPayment ? ' (A higher)' : result1.monthlyPayment < result2.monthlyPayment ? ' (B higher)' : ''}
                        </span>
                      </span>
                    </div>
                    <div className={styles.compareSummaryRow}>
                      <span className={styles.compareSummaryLabel}>Interest Difference</span>
                      <span className={styles.compareSummaryValue}>
                        {formatCurrency(Math.abs(result1.totalInterest - result2.totalInterest))}
                        <span className={styles.compareSummaryHint}>
                          {result1.totalInterest > result2.totalInterest ? ' (A pays more)' : result1.totalInterest < result2.totalInterest ? ' (B pays more)' : ''}
                        </span>
                      </span>
                    </div>
                    <div className={styles.compareSummaryRow}>
                      <span className={styles.compareSummaryLabel}>Total Paid Difference</span>
                      <span className={styles.compareSummaryValue}>
                        {formatCurrency(Math.abs(result1.totalPaid - result2.totalPaid))}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
