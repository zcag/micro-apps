import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

const STORAGE_KEY = 'timestamp-converter-input';

// Common timezones for the searchable dropdown
const TIMEZONES: string[] = (Intl as any).supportedValuesOf('timeZone');

// Quick presets
const QUICK_PRESETS = [
  { label: 'Now', getValue: () => Math.floor(Date.now() / 1000) },
  { label: 'Start of Today', getValue: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); } },
  { label: 'Start of Year', getValue: () => { const d = new Date(new Date().getFullYear(), 0, 1); return Math.floor(d.getTime() / 1000); } },
  { label: 'Unix Epoch', getValue: () => 0 },
  { label: 'Y2K', getValue: () => 946684800 },
  { label: 'Max 32-bit', getValue: () => 2147483647 },
];

function isMilliseconds(ts: number): boolean {
  // If the value is larger than ~year 2100 in seconds, it's likely milliseconds
  return Math.abs(ts) > 4102444800;
}

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const absDiff = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absDiff < 1000) return 'just now';

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30.44);
  const years = Math.floor(days / 365.25);

  let unit: string;
  let value: number;

  if (years > 0) { unit = 'year'; value = years; }
  else if (months > 0) { unit = 'month'; value = months; }
  else if (weeks > 0) { unit = 'week'; value = weeks; }
  else if (days > 0) { unit = 'day'; value = days; }
  else if (hours > 0) { unit = 'hour'; value = hours; }
  else if (minutes > 0) { unit = 'minute'; value = minutes; }
  else { unit = 'second'; value = seconds; }

  const plural = value !== 1 ? 's' : '';
  return isFuture
    ? `in ${value} ${unit}${plural}`
    : `${value} ${unit}${plural} ago`;
}

function formatInTimezone(date: Date, tz: string, format: 'full' | 'iso' | 'rfc2822'): string {
  if (format === 'iso') {
    // Use Intl to get parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      fractionalSecondDigits: 3 as any,
    } as Intl.DateTimeFormatOptions).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    const offset = getTimezoneOffset(date, tz);
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${get('fractionalSecond')}${offset}`;
  }

  if (format === 'rfc2822') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).format(date);
  }

  // full
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'long',
  }).format(date);
}

function getTimezoneOffset(date: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
  // offsetPart is like "GMT+5:30" or "GMT" or "GMT-8"
  if (offsetPart === 'GMT') return '+00:00';
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '+00:00';
  const sign = match[1];
  const hrs = match[2].padStart(2, '0');
  const mins = (match[3] || '00').padStart(2, '0');
  return `${sign}${hrs}:${mins}`;
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365.25);

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  const remDays = days - Math.floor(years * 365.25);
  if (remDays > 0) parts.push(`${remDays} day${remDays !== 1 ? 's' : ''}`);
  const remHours = hours % 24;
  if (remHours > 0) parts.push(`${remHours} hour${remHours !== 1 ? 's' : ''}`);
  const remMinutes = minutes % 60;
  if (remMinutes > 0) parts.push(`${remMinutes} minute${remMinutes !== 1 ? 's' : ''}`);
  const remSeconds = seconds % 60;
  if (remSeconds > 0 || parts.length === 0) parts.push(`${remSeconds} second${remSeconds !== 1 ? 's' : ''}`);

  return parts.join(', ');
}

function loadSavedInput(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveInput(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {}
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <button
      className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ''}`}
      onClick={handleCopy}
      title="Copy to clipboard"
      type="button"
    >
      {copied ? '\u2713' : '\u{1F4CB}'}
    </button>
  );
}

export default function App() {
  const [mode, setMode] = useState<'timestamp' | 'datetime'>('timestamp');
  const [timestampInput, setTimestampInput] = useState(loadSavedInput);
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('00:00:00');
  const [selectedTz, setSelectedTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tzSearch, setTzSearch] = useState('');
  const [showTzDropdown, setShowTzDropdown] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [diffTs1, setDiffTs1] = useState('');
  const [diffTs2, setDiffTs2] = useState('');
  const tzDropdownRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close tz dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzDropdownRef.current && !tzDropdownRef.current.contains(e.target as Node)) {
        setShowTzDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Save input to localStorage
  useEffect(() => {
    saveInput(timestampInput);
  }, [timestampInput]);

  // Filter timezones
  const filteredTz = useMemo(() => {
    if (!tzSearch) return TIMEZONES.slice(0, 50);
    const lower = tzSearch.toLowerCase();
    return TIMEZONES.filter((tz: string) => tz.toLowerCase().includes(lower)).slice(0, 50);
  }, [tzSearch]);

  // Parse the converted date
  const convertedDate = useMemo<Date | null>(() => {
    if (mode === 'timestamp') {
      const val = timestampInput.trim();
      if (!val) return null;
      const num = Number(val);
      if (isNaN(num)) return null;
      const ms = isMilliseconds(num) ? num : num * 1000;
      const d = new Date(ms);
      if (isNaN(d.getTime())) return null;
      return d;
    } else {
      if (!dateInput) return null;
      const dtStr = `${dateInput}T${timeInput || '00:00:00'}`;
      // Parse in the selected timezone
      const d = new Date(dtStr);
      if (isNaN(d.getTime())) return null;
      // Adjust for the selected timezone
      const localOffset = d.getTimezoneOffset();
      const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: selectedTz,
        timeZoneName: 'shortOffset',
      });
      const parts = tzFormatter.formatToParts(d);
      const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
      let tzOffsetMinutes = 0;
      if (offsetStr === 'GMT') {
        tzOffsetMinutes = 0;
      } else {
        const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
        if (match) {
          const sign = match[1] === '+' ? 1 : -1;
          tzOffsetMinutes = sign * (parseInt(match[2]) * 60 + parseInt(match[3] || '0'));
        }
      }
      // Local offset is in minutes, negative means ahead of UTC
      const diff = (-localOffset - tzOffsetMinutes) * 60 * 1000;
      return new Date(d.getTime() + diff);
    }
  }, [mode, timestampInput, dateInput, timeInput, selectedTz]);

  const handlePreset = useCallback((getValue: () => number) => {
    const val = getValue();
    setMode('timestamp');
    setTimestampInput(String(val));
    trackEvent('timestamp_preset');
  }, []);

  const handleSetNow = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    setDateInput(`${y}-${m}-${d}`);
    setTimeInput(`${h}:${min}:${sec}`);
  }, []);

  // Diff calculator
  const diffResult = useMemo(() => {
    const v1 = Number(diffTs1.trim());
    const v2 = Number(diffTs2.trim());
    if (!diffTs1.trim() || !diffTs2.trim() || isNaN(v1) || isNaN(v2)) return null;
    const ms1 = isMilliseconds(v1) ? v1 : v1 * 1000;
    const ms2 = isMilliseconds(v2) ? v2 : v2 * 1000;
    const diffMs = ms2 - ms1;
    return {
      milliseconds: diffMs,
      seconds: diffMs / 1000,
      duration: formatDuration(diffMs),
      sign: diffMs >= 0 ? '+' : '-',
    };
  }, [diffTs1, diffTs2]);

  const nowSeconds = Math.floor(currentTime / 1000);
  const nowMs = currentTime;

  return (
    <Layout title="Timestamp Converter">
      <div className={styles.container}>
        {/* Live Clock Hero */}
        <Card variant="glass">
          <div className={styles.hero}>
            <div className={styles.heroLabel}>Current Unix Timestamp</div>
            <div className={styles.heroTimestamp}>
              <span className={styles.heroValue}>{nowSeconds}</span>
              <CopyButton text={String(nowSeconds)} />
            </div>
            <div className={styles.heroSub}>
              <span className={styles.heroMs}>{nowMs} ms</span>
              <CopyButton text={String(nowMs)} />
            </div>
            <div className={styles.heroClock}>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZoneName: 'short',
              }).format(new Date(currentTime))}
            </div>
          </div>
        </Card>

        {/* Mode Toggle */}
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === 'timestamp' ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('timestamp')}
            type="button"
          >
            Timestamp &rarr; Date
          </button>
          <button
            className={`${styles.modeBtn} ${mode === 'datetime' ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('datetime')}
            type="button"
          >
            Date &rarr; Timestamp
          </button>
        </div>

        {/* Input Section */}
        <Card>
          {mode === 'timestamp' ? (
            <div className={styles.inputSection}>
              <label className={styles.fieldLabel}>Unix Timestamp</label>
              <div className={styles.inputRow}>
                <input
                  className={styles.textInput}
                  type="text"
                  value={timestampInput}
                  onChange={(e) => setTimestampInput(e.target.value)}
                  placeholder="e.g. 1700000000 or 1700000000000"
                  inputMode="numeric"
                />
              </div>
              {timestampInput.trim() && !convertedDate && (
                <div className={styles.errorMsg}>Invalid timestamp</div>
              )}
              {timestampInput.trim() && convertedDate && isMilliseconds(Number(timestampInput.trim())) && (
                <div className={styles.hintMsg}>Auto-detected as milliseconds</div>
              )}

              {/* Quick Presets */}
              <div className={styles.presetsRow}>
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={styles.presetBtn}
                    onClick={() => handlePreset(p.getValue)}
                    type="button"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.inputSection}>
              <div className={styles.dateTimeRow}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Date</label>
                  <input
                    className={styles.textInput}
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Time</label>
                  <input
                    className={styles.textInput}
                    type="time"
                    step="1"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                  />
                </div>
              </div>
              <button
                className={styles.presetBtn}
                onClick={handleSetNow}
                type="button"
                style={{ alignSelf: 'flex-start' }}
              >
                Set to Now
              </button>
            </div>
          )}

          {/* Timezone Selector */}
          <div className={styles.tzSection} ref={tzDropdownRef}>
            <label className={styles.fieldLabel}>Timezone</label>
            <div className={styles.tzSelector}>
              <input
                className={styles.textInput}
                value={showTzDropdown ? tzSearch : selectedTz}
                onChange={(e) => {
                  setTzSearch(e.target.value);
                  setShowTzDropdown(true);
                }}
                onFocus={() => {
                  setTzSearch('');
                  setShowTzDropdown(true);
                }}
                placeholder="Search timezone..."
              />
              {showTzDropdown && (
                <div className={styles.tzDropdown}>
                  {filteredTz.map((tz: string) => (
                    <button
                      key={tz}
                      className={`${styles.tzOption} ${tz === selectedTz ? styles.tzOptionActive : ''}`}
                      onClick={() => {
                        setSelectedTz(tz);
                        setShowTzDropdown(false);
                        setTzSearch('');
                      }}
                      type="button"
                    >
                      <span className={styles.tzName}>{tz.replace(/_/g, ' ')}</span>
                      <span className={styles.tzOffset}>
                        {getTimezoneOffset(new Date(), tz)}
                      </span>
                    </button>
                  ))}
                  {filteredTz.length === 0 && (
                    <div className={styles.tzNoResults}>No timezones found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Output Formats */}
        {convertedDate && (
          <Card>
            <div className={styles.outputSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>{'\u{1F4C5}'}</span>
                <span>Conversion Results</span>
              </div>

              <div className={styles.formatList}>
                <FormatRow
                  label="Unix (seconds)"
                  value={String(Math.floor(convertedDate.getTime() / 1000))}
                />
                <FormatRow
                  label="Unix (milliseconds)"
                  value={String(convertedDate.getTime())}
                />
                <FormatRow
                  label="ISO 8601"
                  value={formatInTimezone(convertedDate, selectedTz, 'iso')}
                />
                <FormatRow
                  label="RFC 2822"
                  value={formatInTimezone(convertedDate, selectedTz, 'rfc2822')}
                />
                <FormatRow
                  label={`Local (${selectedTz.split('/').pop()?.replace(/_/g, ' ')})`}
                  value={formatInTimezone(convertedDate, selectedTz, 'full')}
                />
                <FormatRow
                  label="UTC"
                  value={formatInTimezone(convertedDate, 'UTC', 'full')}
                />
                <FormatRow
                  label="Relative"
                  value={getRelativeTime(convertedDate)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Time Difference Calculator */}
        <Card>
          <div className={styles.diffSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>{'\u{23F1}'}</span>
              <span>Time Difference Calculator</span>
            </div>

            <div className={styles.dateTimeRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Timestamp 1</label>
                <input
                  className={styles.textInput}
                  type="text"
                  value={diffTs1}
                  onChange={(e) => setDiffTs1(e.target.value)}
                  placeholder="e.g. 1700000000"
                  inputMode="numeric"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Timestamp 2</label>
                <input
                  className={styles.textInput}
                  type="text"
                  value={diffTs2}
                  onChange={(e) => setDiffTs2(e.target.value)}
                  placeholder="e.g. 1700086400"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className={styles.diffPresets}>
              <Button
                variant="secondary"
                onClick={() => setDiffTs1(String(Math.floor(Date.now() / 1000)))}
                style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }}
              >
                Set #1 to Now
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDiffTs2(String(Math.floor(Date.now() / 1000)))}
                style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }}
              >
                Set #2 to Now
              </Button>
            </div>

            {diffResult && (
              <div className={styles.diffResult}>
                <div className={styles.diffDuration}>{diffResult.duration}</div>
                <div className={styles.diffDetails}>
                  <span>{diffResult.sign}{Math.abs(diffResult.seconds).toLocaleString()} seconds</span>
                  <span>{diffResult.sign}{Math.abs(diffResult.milliseconds).toLocaleString()} ms</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}

function FormatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.formatRow}>
      <div className={styles.formatLabel}>{label}</div>
      <div className={styles.formatValue}>
        <code className={styles.formatCode}>{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}
