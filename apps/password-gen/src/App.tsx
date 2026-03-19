import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

type Mode = 'password' | 'pronounceable' | 'passphrase';

interface StrengthInfo {
  label: string;
  level: 0 | 1 | 2 | 3;
  color: string;
}

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const DEFAULT_SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const VOWELS = 'aeiou';

// Common short words for passphrase mode
const WORD_LIST = [
  'apple', 'brave', 'creek', 'dance', 'eagle', 'flame', 'grape', 'haven',
  'ivory', 'jewel', 'knack', 'lemon', 'maple', 'noble', 'ocean', 'pearl',
  'quest', 'river', 'stone', 'tiger', 'unity', 'vivid', 'waltz', 'xenon',
  'yacht', 'zesty', 'amber', 'blaze', 'cedar', 'delta', 'ember', 'frost',
  'globe', 'haste', 'inlet', 'jolly', 'karma', 'lotus', 'mango', 'nexus',
  'oasis', 'plaza', 'quilt', 'reign', 'solar', 'torch', 'urban', 'vapor',
  'wheat', 'youth', 'agile', 'bloom', 'cloak', 'drift', 'elbow', 'forge',
  'gleam', 'hover', 'index', 'jelly', 'koala', 'latch', 'moose', 'nerve',
  'orbit', 'prism', 'queen', 'roost', 'swift', 'trail', 'ultra', 'vault',
  'wrist', 'oxide', 'candy', 'flint', 'badge', 'crane', 'dusk', 'fable',
  'hazel', 'ivory', 'lunar', 'marsh', 'north', 'olive', 'plume', 'racer',
  'ridge', 'storm', 'thorn', 'viola', 'weave', 'coral', 'grove', 'spark',
  'steel', 'cloud', 'haven', 'pixel', 'robin', 'shade', 'spice', 'brisk',
  'cider', 'frost', 'gleam', 'lofty', 'plaid', 'quirk', 'raven', 'tulip',
  'vivid', 'blend', 'daisy', 'fjord', 'haven', 'media', 'novel', 'pilot',
  'rhyme', 'scene', 'thyme', 'vigor', 'woven', 'bonus', 'crisp', 'dunes',
];

function cryptoRandom(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function generatePassword(
  length: number,
  useUpper: boolean,
  useLower: boolean,
  useNumbers: boolean,
  useSymbols: boolean,
  symbolSet: string
): string {
  let chars = '';
  const required: string[] = [];

  if (useUpper) {
    chars += UPPERCASE;
    required.push(UPPERCASE[cryptoRandom(UPPERCASE.length)]);
  }
  if (useLower) {
    chars += LOWERCASE;
    required.push(LOWERCASE[cryptoRandom(LOWERCASE.length)]);
  }
  if (useNumbers) {
    chars += NUMBERS;
    required.push(NUMBERS[cryptoRandom(NUMBERS.length)]);
  }
  if (useSymbols) {
    const syms = symbolSet || DEFAULT_SYMBOLS;
    chars += syms;
    required.push(syms[cryptoRandom(syms.length)]);
  }

  if (!chars) chars = LOWERCASE;

  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    result.push(chars[cryptoRandom(chars.length)]);
  }

  // Ensure at least one character from each required set
  for (let i = 0; i < required.length && i < length; i++) {
    const pos = cryptoRandom(length);
    result[pos] = required[i];
  }

  return result.join('');
}

function generatePronounceable(length: number): string {
  let result = '';
  let useConsonant = cryptoRandom(2) === 0;

  while (result.length < length) {
    if (useConsonant) {
      result += CONSONANTS[cryptoRandom(CONSONANTS.length)];
    } else {
      result += VOWELS[cryptoRandom(VOWELS.length)];
    }
    useConsonant = !useConsonant;
  }

  return result.slice(0, length);
}

function generatePassphrase(wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(WORD_LIST[cryptoRandom(WORD_LIST.length)]);
  }
  return words.join('-');
}

function assessStrength(password: string): StrengthInfo {
  if (!password) return { label: 'None', level: 0, color: 'var(--text-secondary)' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 16) score++;
  if (password.length >= 24) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  // Check for variety
  const unique = new Set(password).size;
  if (unique >= password.length * 0.6) score++;

  if (score <= 2) return { label: 'Weak', level: 0, color: '#ef4444' };
  if (score <= 4) return { label: 'Fair', level: 1, color: '#f59e0b' };
  if (score <= 6) return { label: 'Strong', level: 2, color: '#22c55e' };
  return { label: 'Very Strong', level: 3, color: '#0891B2' };
}

function getHistoryFromSession(): string[] {
  try {
    const data = sessionStorage.getItem('password-gen-history');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveHistoryToSession(history: string[]) {
  try {
    sessionStorage.setItem('password-gen-history', JSON.stringify(history));
  } catch {
    // ignore
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('password');
  const [password, setPassword] = useState('');
  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [symbolSet, setSymbolSet] = useState(DEFAULT_SYMBOLS);
  const [wordCount, setWordCount] = useState(4);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>(getHistoryFromSession);
  const [showHistory, setShowHistory] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const copyTimeoutRef = useRef<number>();

  const generate = useCallback(() => {
    let pw: string;
    if (mode === 'password') {
      pw = generatePassword(length, useUpper, useLower, useNumbers, useSymbols, symbolSet);
    } else if (mode === 'pronounceable') {
      pw = generatePronounceable(length);
    } else {
      pw = generatePassphrase(wordCount);
    }
    setPassword(pw);
    setRevealKey((k) => k + 1);
    setCopied(false);

    // Update history
    setHistory((prev) => {
      const next = [pw, ...prev.filter((p) => p !== pw)].slice(0, 5);
      saveHistoryToSession(next);
      return next;
    });

    trackEvent('generate_password', { mode, length: String(mode === 'passphrase' ? wordCount : length) });
  }, [mode, length, useUpper, useLower, useNumbers, useSymbols, symbolSet, wordCount]);

  // Generate on mount and when settings change
  useEffect(() => {
    generate();
  }, [generate]);

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      trackEvent('copy_password');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = password;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const strength = assessStrength(password);
  const strengthPercent = ((strength.level + 1) / 4) * 100;

  return (
    <Layout title="Password Generator">
      <div className={styles.container}>
        {/* Password Display */}
        <div className={styles.heroSection}>
          <Card>
            <div className={styles.passwordDisplay} key={revealKey}>
              <div className={styles.passwordText}>
                {password || 'Click generate'}
              </div>
            </div>

            {/* Strength meter */}
            <div className={styles.strengthSection}>
              <div className={styles.strengthBar}>
                <div
                  className={styles.strengthFill}
                  style={{
                    width: `${strengthPercent}%`,
                    background: strength.color,
                  }}
                />
              </div>
              <div className={styles.strengthLabel} style={{ color: strength.color }}>
                {strength.label}
              </div>
            </div>

            {/* Action buttons */}
            <div className={styles.actionRow}>
              <button
                type="button"
                className={`${styles.copyButton} ${copied ? styles.copyButtonSuccess : ''}`}
                onClick={handleCopy}
              >
                <span className={styles.copyIcon}>{copied ? '✓' : '📋'}</span>
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
              <Button variant="gradient" haptic onClick={generate}>
                Generate New
              </Button>
            </div>

            {/* Generated locally badge */}
            <div className={styles.localBadge}>
              <span className={styles.localBadgeIcon}>🔒</span>
              <span>Generated locally — never sent anywhere</span>
            </div>
          </Card>
        </div>

        {/* Mode selector */}
        <Card>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>⚙️</span>
            <span>Mode</span>
            <span className={styles.sectionDivider} />
          </div>
          <SegmentedControl
            options={[
              { label: 'Password', value: 'password' as Mode },
              { label: 'Pronounceable', value: 'pronounceable' as Mode },
              { label: 'Passphrase', value: 'passphrase' as Mode },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Card>

        {/* Settings */}
        <Card>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>🎛️</span>
            <span>Settings</span>
            <span className={styles.sectionDivider} />
          </div>

          {mode !== 'passphrase' ? (
            <>
              {/* Length slider */}
              <div className={styles.sliderSection}>
                <div className={styles.sliderHeader}>
                  <span className={styles.sliderLabel}>Length</span>
                  <span className={styles.sliderValue}>{length}</span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min="8"
                  max="128"
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
                <div className={styles.sliderRange}>
                  <span>8</span>
                  <span>128</span>
                </div>
              </div>

              {/* Character toggles (password mode only) */}
              {mode === 'password' && (
                <div className={styles.togglesSection}>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${useUpper ? styles.toggleActive : ''}`}
                    onClick={() => setUseUpper((v) => !v)}
                  >
                    <span className={styles.toggleCheck}>{useUpper ? '✓' : ''}</span>
                    <span className={styles.toggleLabel}>ABC</span>
                    <span className={styles.toggleDesc}>Uppercase</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${useLower ? styles.toggleActive : ''}`}
                    onClick={() => setUseLower((v) => !v)}
                  >
                    <span className={styles.toggleCheck}>{useLower ? '✓' : ''}</span>
                    <span className={styles.toggleLabel}>abc</span>
                    <span className={styles.toggleDesc}>Lowercase</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${useNumbers ? styles.toggleActive : ''}`}
                    onClick={() => setUseNumbers((v) => !v)}
                  >
                    <span className={styles.toggleCheck}>{useNumbers ? '✓' : ''}</span>
                    <span className={styles.toggleLabel}>123</span>
                    <span className={styles.toggleDesc}>Numbers</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${useSymbols ? styles.toggleActive : ''}`}
                    onClick={() => setUseSymbols((v) => !v)}
                  >
                    <span className={styles.toggleCheck}>{useSymbols ? '✓' : ''}</span>
                    <span className={styles.toggleLabel}>#$&</span>
                    <span className={styles.toggleDesc}>Symbols</span>
                  </button>
                </div>
              )}

              {/* Custom symbols input */}
              {mode === 'password' && useSymbols && (
                <div className={styles.customSymbolsSection}>
                  <label className={styles.customSymbolsLabel}>Custom symbols</label>
                  <input
                    type="text"
                    className={styles.customSymbolsInput}
                    value={symbolSet}
                    onChange={(e) => setSymbolSet(e.target.value)}
                    placeholder={DEFAULT_SYMBOLS}
                  />
                </div>
              )}
            </>
          ) : (
            /* Passphrase word count */
            <div className={styles.sliderSection}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>Word Count</span>
                <span className={styles.sliderValue}>{wordCount}</span>
              </div>
              <input
                type="range"
                className={styles.slider}
                min="4"
                max="6"
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
              />
              <div className={styles.sliderRange}>
                <span>4</span>
                <span>6</span>
              </div>
            </div>
          )}
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <button
              type="button"
              className={styles.historyToggle}
              onClick={() => setShowHistory((v) => !v)}
            >
              <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                <span className={styles.sectionHeaderIcon}>🕐</span>
                <span>Recent ({history.length})</span>
                <span className={styles.sectionDivider} />
              </div>
              <span className={`${styles.historyChevron} ${showHistory ? styles.historyChevronOpen : ''}`}>
                ▾
              </span>
            </button>
            {showHistory && (
              <div className={styles.historyList}>
                {history.map((pw, i) => (
                  <div key={`${pw}-${i}`} className={styles.historyItem}>
                    <span className={styles.historyPassword}>{pw}</span>
                    <button
                      type="button"
                      className={styles.historyCopy}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pw);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = pw;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                      }}
                    >
                      📋
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}
