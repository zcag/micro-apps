import { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  Input,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  nextBirthdayDays: number;
  dayOfWeek: string;
  zodiac: string;
  zodiacEmoji: string;
  chineseZodiac: string;
  chineseZodiacEmoji: string;
  generation: string;
  heartbeats: number;
  breaths: number;
  sunrises: number;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ZODIAC_SIGNS: { name: string; emoji: string; start: [number, number]; end: [number, number] }[] = [
  { name: 'Capricorn', emoji: '\u2651', start: [12, 22], end: [1, 19] },
  { name: 'Aquarius', emoji: '\u2652', start: [1, 20], end: [2, 18] },
  { name: 'Pisces', emoji: '\u2653', start: [2, 19], end: [3, 20] },
  { name: 'Aries', emoji: '\u2648', start: [3, 21], end: [4, 19] },
  { name: 'Taurus', emoji: '\u2649', start: [4, 20], end: [5, 20] },
  { name: 'Gemini', emoji: '\u264A', start: [5, 21], end: [6, 20] },
  { name: 'Cancer', emoji: '\u264B', start: [6, 21], end: [7, 22] },
  { name: 'Leo', emoji: '\u264C', start: [7, 23], end: [8, 22] },
  { name: 'Virgo', emoji: '\u264D', start: [8, 23], end: [9, 22] },
  { name: 'Libra', emoji: '\u264E', start: [9, 23], end: [10, 22] },
  { name: 'Scorpio', emoji: '\u264F', start: [10, 23], end: [11, 21] },
  { name: 'Sagittarius', emoji: '\u2650', start: [11, 22], end: [12, 21] },
];

const CHINESE_ZODIAC: { name: string; emoji: string }[] = [
  { name: 'Rat', emoji: '\uD83D\uDC00' },
  { name: 'Ox', emoji: '\uD83D\uDC02' },
  { name: 'Tiger', emoji: '\uD83D\uDC05' },
  { name: 'Rabbit', emoji: '\uD83D\uDC07' },
  { name: 'Dragon', emoji: '\uD83D\uDC09' },
  { name: 'Snake', emoji: '\uD83D\uDC0D' },
  { name: 'Horse', emoji: '\uD83D\uDC0E' },
  { name: 'Goat', emoji: '\uD83D\uDC10' },
  { name: 'Monkey', emoji: '\uD83D\uDC12' },
  { name: 'Rooster', emoji: '\uD83D\uDC13' },
  { name: 'Dog', emoji: '\uD83D\uDC15' },
  { name: 'Pig', emoji: '\uD83D\uDC16' },
];

function getZodiacSign(month: number, day: number): { name: string; emoji: string } {
  for (const sign of ZODIAC_SIGNS) {
    if (sign.name === 'Capricorn') {
      if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
        return { name: sign.name, emoji: sign.emoji };
      }
    } else {
      if (
        (month === sign.start[0] && day >= sign.start[1]) ||
        (month === sign.end[0] && day <= sign.end[1])
      ) {
        return { name: sign.name, emoji: sign.emoji };
      }
    }
  }
  return { name: 'Capricorn', emoji: '\u2651' };
}

function getChineseZodiac(year: number): { name: string; emoji: string } {
  const index = ((year - 4) % 12 + 12) % 12;
  return CHINESE_ZODIAC[index];
}

function getGeneration(year: number): string {
  if (year >= 2013) return 'Gen Alpha';
  if (year >= 1997) return 'Gen Z';
  if (year >= 1981) return 'Millennial';
  if (year >= 1965) return 'Gen X';
  if (year >= 1946) return 'Baby Boomer';
  if (year >= 1928) return 'Silent Generation';
  return 'Greatest Generation';
}

function calculateAge(birthDate: Date, targetDate: Date): AgeResult | null {
  if (birthDate >= targetDate) return null;

  let years = targetDate.getFullYear() - birthDate.getFullYear();
  let months = targetDate.getMonth() - birthDate.getMonth();
  let days = targetDate.getDate() - birthDate.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalDays = Math.floor((targetDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));

  // Next birthday
  let nextBirthday = new Date(targetDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (nextBirthday <= targetDate) {
    nextBirthday = new Date(targetDate.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate());
  }
  const nextBirthdayDays = Math.ceil((nextBirthday.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  const dayOfWeek = DAYS_OF_WEEK[birthDate.getDay()];
  const zodiac = getZodiacSign(birthDate.getMonth() + 1, birthDate.getDate());
  const chineseZodiac = getChineseZodiac(birthDate.getFullYear());
  const generation = getGeneration(birthDate.getFullYear());

  // Fun facts: avg 72 beats/min, 15 breaths/min, 1 sunrise/day
  const totalMinutes = totalDays * 24 * 60;
  const heartbeats = totalMinutes * 72;
  const breaths = totalMinutes * 15;
  const sunrises = totalDays;

  return {
    years,
    months,
    days,
    totalDays,
    nextBirthdayDays,
    dayOfWeek,
    zodiac: zodiac.name,
    zodiacEmoji: zodiac.emoji,
    chineseZodiac: chineseZodiac.name,
    chineseZodiacEmoji: chineseZodiac.emoji,
    generation,
    heartbeats,
    breaths,
    sunrises,
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return n.toLocaleString();
  return String(n);
}

/** Animated count-up hook */
function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.5) {
      setDisplay(target);
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
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

function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{animated.toLocaleString()}</>;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function App() {
  const [birthDateStr, setBirthDateStr] = useState('');
  const [targetDateStr, setTargetDateStr] = useState('');
  const [useCustomTarget, setUseCustomTarget] = useState(false);
  const [result, setResult] = useState<AgeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCalculate = () => {
    if (!birthDateStr) return;
    const birth = new Date(birthDateStr + 'T00:00:00');
    const target = useCustomTarget && targetDateStr
      ? new Date(targetDateStr + 'T00:00:00')
      : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    const r = calculateAge(birth, target);
    setResult(r);
    if (r) {
      trackEvent('calculate', { years: String(r.years) });
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const lines = [
      `Age: ${result.years} years, ${result.months} months, ${result.days} days`,
      `Total days alive: ${result.totalDays.toLocaleString()}`,
      `Next birthday: ${result.nextBirthdayDays} days away`,
      `Born on: ${result.dayOfWeek}`,
      `Zodiac: ${result.zodiacEmoji} ${result.zodiac}`,
      `Chinese Zodiac: ${result.chineseZodiacEmoji} ${result.chineseZodiac}`,
      `Generation: ${result.generation}`,
      `Heartbeats: ~${formatNumber(result.heartbeats)}`,
      `Breaths: ~${formatNumber(result.breaths)}`,
      `Sunrises: ${result.sunrises.toLocaleString()}`,
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const handleReset = () => {
    setBirthDateStr('');
    setTargetDateStr('');
    setUseCustomTarget(false);
    setResult(null);
  };

  return (
    <Layout title="Age Calculator">
      <div className={styles.container}>
        <div className={styles.heroSection}>
          <Card>
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                🎂 Date of Birth
              </div>
              <Input
                label="Birthday"
                type="date"
                value={birthDateStr}
                max={todayString()}
                onChange={(e) => {
                  setBirthDateStr(e.target.value);
                  setResult(null);
                }}
              />
            </div>

            {/* Custom target date toggle */}
            <button
              className={`${styles.targetToggle} ${useCustomTarget ? styles.targetToggleActive : ''}`}
              onClick={() => {
                setUseCustomTarget(!useCustomTarget);
                setResult(null);
              }}
              type="button"
            >
              <span className={styles.targetToggleCheck}>{useCustomTarget ? '\u2713' : ''}</span>
              <span>📅 Use custom target date</span>
            </button>

            {useCustomTarget && (
              <div className={styles.inputGroup}>
                <div className={styles.inputGroupLabel}>
                  📅 Target Date
                </div>
                <Input
                  label="Target date"
                  type="date"
                  value={targetDateStr}
                  onChange={(e) => {
                    setTargetDateStr(e.target.value);
                    setResult(null);
                  }}
                />
              </div>
            )}

            <div className={styles.buttonRow}>
              <Button variant="gradient" onClick={handleCalculate} haptic>
                Calculate Age
              </Button>
              {result && (
                <Button variant="secondary" onClick={handleReset}>
                  Clear
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Results divider */}
            <div className={styles.resultsDivider}>
              <span className={styles.resultsDividerLine} />
              <span className={styles.resultsDividerIcon}>\u25BC</span>
              <span className={styles.resultsDividerLine} />
            </div>

            <div className={styles.resultsContainer}>
              {/* Primary age display */}
              <div className={styles.primaryResult}>
                <div className={styles.primaryResultLabel}>Your Age</div>
                <div className={styles.primaryResultValue}>
                  <AnimatedNumber value={result.years} />
                </div>
                <div className={styles.primaryResultUnit}>
                  years, {result.months} months, {result.days} days
                </div>
              </div>

              {/* Stats grid */}
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>📆</div>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={result.totalDays} />
                  </div>
                  <div className={styles.statLabel}>Total Days</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>🎉</div>
                  <div className={styles.statValue}>
                    <AnimatedNumber value={result.nextBirthdayDays} />
                  </div>
                  <div className={styles.statLabel}>Days to Birthday</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>📅</div>
                  <div className={styles.statValue}>{result.dayOfWeek}</div>
                  <div className={styles.statLabel}>Born On</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>{result.zodiacEmoji}</div>
                  <div className={styles.statValue}>{result.zodiac}</div>
                  <div className={styles.statLabel}>Zodiac Sign</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>{result.chineseZodiacEmoji}</div>
                  <div className={styles.statValue}>{result.chineseZodiac}</div>
                  <div className={styles.statLabel}>Chinese Zodiac</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statEmoji}>👥</div>
                  <div className={styles.statValue}>{result.generation}</div>
                  <div className={styles.statLabel}>Generation</div>
                </div>
              </div>

              {/* Fun facts */}
              <div className={styles.funFactsSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionHeaderIcon}>✨</span>
                  <span>Fun Facts</span>
                  <span className={styles.sectionDivider} />
                </div>
                <div className={styles.funFactsGrid}>
                  <div className={styles.funFact}>
                    <span className={styles.funFactEmoji}>💓</span>
                    <span className={styles.funFactValue}>~{formatNumber(result.heartbeats)}</span>
                    <span className={styles.funFactLabel}>heartbeats</span>
                  </div>
                  <div className={styles.funFact}>
                    <span className={styles.funFactEmoji}>🌬️</span>
                    <span className={styles.funFactValue}>~{formatNumber(result.breaths)}</span>
                    <span className={styles.funFactLabel}>breaths taken</span>
                  </div>
                  <div className={styles.funFact}>
                    <span className={styles.funFactEmoji}>🌅</span>
                    <span className={styles.funFactValue}>{result.sunrises.toLocaleString()}</span>
                    <span className={styles.funFactLabel}>sunrises witnessed</span>
                  </div>
                </div>
              </div>

              {/* Copy button */}
              <button
                className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
                onClick={handleCopy}
                type="button"
              >
                <span className={styles.copyIcon}>{copied ? '\u2713' : '📋'}</span>
                {copied ? 'Copied!' : 'Copy All Results'}
              </button>
            </div>
          </>
        )}

        {/* Empty state */}
        {!result && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🎂</div>
              <div className={styles.emptyStateText}>Enter your birthday to discover your age stats</div>
              <div className={styles.emptyStateHint}>
                zodiac sign, generation, fun facts & more
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
