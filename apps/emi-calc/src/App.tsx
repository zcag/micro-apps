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
type TenureUnit = 'years' | 'months';

interface EMIResult {
  emi: number;
  totalInterest: number;
  totalAmount: number;
  principalPercent: number;
  interestPercent: number;
}

interface AmortizationRow {
  month: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
}

const STORAGE_KEY = 'emi-calc-state';

/* ─── Math helpers ─── */

function calculateEMI(
  principal: number,
  annualRate: number,
  tenureMonths: number
): EMIResult | null {
  if (principal <= 0 || tenureMonths <= 0) return null;
  if (annualRate <= 0) {
    const emi = principal / tenureMonths;
    return {
      emi,
      totalInterest: 0,
      totalAmount: principal,
      principalPercent: 100,
      interestPercent: 0,
    };
  }
  const r = annualRate / 100 / 12;
  const n = tenureMonths;
  const factor = Math.pow(1 + r, n);
  const emi = (principal * r * factor) / (factor - 1);
  const totalAmount = emi * n;
  const totalInterest = totalAmount - principal;
  const principalPercent = (principal / totalAmount) * 100;
  const interestPercent = (totalInterest / totalAmount) * 100;
  return { emi, totalInterest, totalAmount, principalPercent, interestPercent };
}

function generateAmortization(
  principal: number,
  annualRate: number,
  tenureMonths: number
): AmortizationRow[] {
  const result = calculateEMI(principal, annualRate, tenureMonths);
  if (!result) return [];
  const r = annualRate / 100 / 12;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let month = 1; month <= tenureMonths && balance > 0.01; month++) {
    const interest = balance * r;
    const payment = Math.min(result.emi, balance + interest);
    const principalPaid = payment - interest;
    balance = Math.max(0, balance - principalPaid);
    rows.push({
      month,
      emi: payment,
      principal: principalPaid,
      interest,
      balance,
    });
  }
  return rows;
}

function exportCSV(rows: AmortizationRow[], principal: number, rate: number, tenure: number): void {
  const header = 'Month,EMI,Principal,Interest,Balance\n';
  const meta = `# Loan: ${formatCurrency(principal)} @ ${rate}% for ${tenure} months\n`;
  const csv = meta + header + rows.map(r =>
    `${r.month},${r.emi.toFixed(2)},${r.principal.toFixed(2)},${r.interest.toFixed(2)},${r.balance.toFixed(2)}`
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amortization-schedule.csv';
  a.click();
  URL.revokeObjectURL(url);
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
  return <>{formatCurrency(animated)}</>;
}

function AnimatedInt({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{Math.round(animated)}</>;
}

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Donut Chart (SVG) ─── */

function DonutChart({
  principalPercent,
  interestPercent,
  size = 180,
}: {
  principalPercent: number;
  interestPercent: number;
  size?: number;
}) {
  const animatedPrincipal = useCountUp(principalPercent, 800);
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#emiPrincipalGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${principalArc} ${circumference - principalArc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <defs>
          <linearGradient id="emiPrincipalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#818cf8" />
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
          <span className={styles.legendDot} style={{ background: 'linear-gradient(135deg, #4f46e5, #818cf8)' }} />
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

/* ─── EMI Input Panel ─── */

function EMIPanel({
  label,
  amount,
  setAmount,
  rate,
  setRate,
  tenureValue,
  setTenureValue,
  tenureUnit,
  setTenureUnit,
  compact,
}: {
  label?: string;
  amount: string;
  setAmount: (v: string) => void;
  rate: string;
  setRate: (v: string) => void;
  tenureValue: string;
  setTenureValue: (v: string) => void;
  tenureUnit: TenureUnit;
  setTenureUnit: (v: TenureUnit) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? styles.compactPanel : undefined}>
      {label && <div className={styles.panelLabel}>{label}</div>}

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>💰</span>
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
              placeholder="500,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <input
            type="range"
            className={styles.rangeSlider}
            min="10000"
            max="5000000"
            step="10000"
            value={parseFloat(amount) || 500000}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>📊</span>
          <span>Annual Interest Rate</span>
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
              step="0.1"
              placeholder="8.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <input
            type="range"
            className={styles.rangeSlider}
            min="0.5"
            max="20"
            step="0.1"
            value={parseFloat(rate) || 8.5}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionHeaderIcon}>📅</span>
          <span>Loan Tenure</span>
          <span className={styles.sectionDivider} />
        </div>
        <div className={styles.tenureRow}>
          <div className={styles.tenureInput}>
            <Input
              label=""
              suffix={tenureUnit === 'years' ? 'yr' : 'mo'}
              type="number"
              inputMode="numeric"
              min="1"
              value={tenureValue}
              onChange={(e) => setTenureValue(e.target.value)}
            />
          </div>
          <SegmentedControl
            options={[
              { label: 'Years', value: 'years' as TenureUnit },
              { label: 'Months', value: 'months' as TenureUnit },
            ]}
            value={tenureUnit}
            onChange={setTenureUnit}
          />
        </div>
        {!compact && (
          <div className={styles.sliderInputRow} style={{ marginTop: 8 }}>
            <input
              type="range"
              className={styles.rangeSlider}
              min={tenureUnit === 'years' ? '1' : '6'}
              max={tenureUnit === 'years' ? '30' : '360'}
              step="1"
              value={parseFloat(tenureValue) || (tenureUnit === 'years' ? 20 : 240)}
              onChange={(e) => setTenureValue(e.target.value)}
            />
          </div>
        )}
        {!compact && (
          <div className={styles.presetChips}>
            {[
              { label: '5 yr', years: 5 },
              { label: '10 yr', years: 10 },
              { label: '15 yr', years: 15 },
              { label: '20 yr', years: 20 },
              { label: '30 yr', years: 30 },
            ].map((preset) => (
              <button
                key={preset.years}
                type="button"
                className={`${styles.presetChip} ${
                  tenureUnit === 'years' && tenureValue === String(preset.years)
                    ? styles.presetChipActive
                    : ''
                }`}
                onClick={() => {
                  setTenureUnit('years');
                  setTenureValue(String(preset.years));
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main App ─── */

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('calculator');

  // Primary inputs
  const [amount, setAmount] = useState('500000');
  const [rate, setRate] = useState('8.5');
  const [tenureValue, setTenureValue] = useState('20');
  const [tenureUnit, setTenureUnit] = useState<TenureUnit>('years');

  // Compare inputs
  const [amount2, setAmount2] = useState('500000');
  const [rate2, setRate2] = useState('8.5');
  const [tenureValue2, setTenureValue2] = useState('15');
  const [tenureUnit2, setTenureUnit2] = useState<TenureUnit>('years');

  // Amortization
  const [showAmortization, setShowAmortization] = useState(false);
  const [amortizationPage, setAmortizationPage] = useState(0);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.amount) setAmount(s.amount);
        if (s.rate) setRate(s.rate);
        if (s.tenureValue) setTenureValue(s.tenureValue);
        if (s.tenureUnit) setTenureUnit(s.tenureUnit);
      }
    } catch { /* ignore */ }
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        amount, rate, tenureValue, tenureUnit,
      }));
    } catch { /* ignore */ }
  }, [amount, rate, tenureValue, tenureUnit]);

  const getTenureMonths = useCallback(
    (tv: string, tu: TenureUnit) =>
      tu === 'years' ? (parseFloat(tv) || 0) * 12 : parseFloat(tv) || 0,
    []
  );

  const tenureMonths1 = getTenureMonths(tenureValue, tenureUnit);
  const principal1 = parseFloat(amount) || 0;
  const annualRate1 = parseFloat(rate) || 0;
  const result1 = calculateEMI(principal1, annualRate1, tenureMonths1);

  const tenureMonths2 = getTenureMonths(tenureValue2, tenureUnit2);
  const principal2 = parseFloat(amount2) || 0;
  const annualRate2 = parseFloat(rate2) || 0;
  const result2 = calculateEMI(principal2, annualRate2, tenureMonths2);

  const amortization = generateAmortization(principal1, annualRate1, tenureMonths1);

  const ROWS_PER_PAGE = 24;
  const totalPages = Math.ceil(amortization.length / ROWS_PER_PAGE);
  const visibleAmortization = amortization.slice(
    amortizationPage * ROWS_PER_PAGE,
    (amortizationPage + 1) * ROWS_PER_PAGE
  );

  const handleExportCSV = () => {
    exportCSV(amortization, principal1, annualRate1, tenureMonths1);
    trackEvent('export_csv', {});
  };

  return (
    <Layout title="EMI Calculator">
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
                <EMIPanel
                  amount={amount}
                  setAmount={setAmount}
                  rate={rate}
                  setRate={setRate}
                  tenureValue={tenureValue}
                  setTenureValue={setTenureValue}
                  tenureUnit={tenureUnit}
                  setTenureUnit={setTenureUnit}
                />
              </Card>
            </div>

            {/* Results */}
            {result1 ? (
              <>
                <div className={styles.resultsDivider}>
                  <span className={styles.resultsDividerLine} />
                  <span className={styles.resultsDividerIcon}>▼</span>
                  <span className={styles.resultsDividerLine} />
                </div>

                <div className={styles.resultsContainer}>
                  {/* Primary EMI result */}
                  <div className={styles.primaryResult}>
                    <div className={styles.primaryResultLabel}>Monthly EMI</div>
                    <div className={styles.primaryResultValue}>
                      <AnimatedCurrency value={result1.emi} />
                    </div>
                  </div>

                  {/* Breakdown cards */}
                  <div className={styles.breakdownGrid}>
                    <div className={styles.breakdownCard}>
                      <div className={styles.breakdownEmoji}>💰</div>
                      <div className={styles.breakdownValue}>
                        <AnimatedCurrency value={principal1} />
                      </div>
                      <div className={styles.breakdownLabel}>Principal</div>
                    </div>
                    <div className={styles.breakdownCard}>
                      <div className={styles.breakdownEmoji}>📈</div>
                      <div className={styles.breakdownValue}>
                        <AnimatedCurrency value={result1.totalInterest} />
                      </div>
                      <div className={styles.breakdownLabel}>Total Interest</div>
                    </div>
                    <div className={`${styles.breakdownCard} ${styles.breakdownCardFull}`}>
                      <div className={styles.breakdownEmoji}>🏦</div>
                      <div className={styles.breakdownValue}>
                        <AnimatedCurrency value={result1.totalAmount} />
                      </div>
                      <div className={styles.breakdownLabel}>Total Amount Payable</div>
                    </div>
                  </div>

                  {/* Donut chart */}
                  <Card>
                    <div className={styles.chartSection}>
                      <div className={styles.sectionHeader}>
                        <span className={styles.sectionHeaderIcon}>📊</span>
                        <span>Principal vs Interest</span>
                        <span className={styles.sectionDivider} />
                      </div>
                      <DonutChart
                        principalPercent={result1.principalPercent}
                        interestPercent={result1.interestPercent}
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
                        {/* Export button */}
                        <div className={styles.exportRow}>
                          <Button variant="secondary" onClick={handleExportCSV}>
                            Export CSV
                          </Button>
                        </div>

                        <div className={styles.tableHeader}>
                          <span className={styles.tableHeaderCell}>Mo</span>
                          <span className={styles.tableHeaderCell}>EMI</span>
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
                              {formatCurrency(row.emi)}
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
                  <div className={styles.emptyStateIcon}>🧮</div>
                  <div className={styles.emptyStateText}>
                    Enter loan details to calculate EMI
                  </div>
                  <div className={styles.emptyStateHint}>
                    Monthly EMI, total interest, and amortization schedule
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
                    <EMIPanel
                      label="Scenario A"
                      amount={amount}
                      setAmount={setAmount}
                      rate={rate}
                      setRate={setRate}
                      tenureValue={tenureValue}
                      setTenureValue={setTenureValue}
                      tenureUnit={tenureUnit}
                      setTenureUnit={setTenureUnit}
                      compact
                    />
                  </Card>
                </div>

                {result1 && (
                  <div className={styles.compareResult}>
                    <div className={styles.compareResultValue}>
                      <AnimatedCurrency value={result1.emi} />
                    </div>
                    <div className={styles.compareResultLabel}>/ month EMI</div>
                    <div className={styles.compareResultDetail}>
                      Total: {formatCurrency(result1.totalAmount)}
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
                    <EMIPanel
                      label="Scenario B"
                      amount={amount2}
                      setAmount={setAmount2}
                      rate={rate2}
                      setRate={setRate2}
                      tenureValue={tenureValue2}
                      setTenureValue={setTenureValue2}
                      tenureUnit={tenureUnit2}
                      setTenureUnit={setTenureUnit2}
                      compact
                    />
                  </Card>
                </div>

                {result2 && (
                  <div className={styles.compareResult}>
                    <div className={styles.compareResultValue}>
                      <AnimatedCurrency value={result2.emi} />
                    </div>
                    <div className={styles.compareResultLabel}>/ month EMI</div>
                    <div className={styles.compareResultDetail}>
                      Total: {formatCurrency(result2.totalAmount)}
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
                      <span className={styles.compareSummaryLabel}>EMI Difference</span>
                      <span className={styles.compareSummaryValue}>
                        {formatCurrency(Math.abs(result1.emi - result2.emi))}
                        <span className={styles.compareSummaryHint}>
                          {result1.emi > result2.emi ? ' (A higher)' : result1.emi < result2.emi ? ' (B higher)' : ''}
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
                      <span className={styles.compareSummaryLabel}>Total Amount Difference</span>
                      <span className={styles.compareSummaryValue}>
                        {formatCurrency(Math.abs(result1.totalAmount - result2.totalAmount))}
                      </span>
                    </div>
                  </div>

                  {/* Side by side donut charts */}
                  <div className={styles.compareCharts}>
                    <div className={styles.compareChartItem}>
                      <div className={styles.compareChartLabel}>Scenario A</div>
                      <DonutChart
                        principalPercent={result1.principalPercent}
                        interestPercent={result1.interestPercent}
                        size={140}
                      />
                    </div>
                    <div className={styles.compareChartItem}>
                      <div className={styles.compareChartLabel}>Scenario B</div>
                      <DonutChart
                        principalPercent={result2.principalPercent}
                        interestPercent={result2.interestPercent}
                        size={140}
                      />
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
