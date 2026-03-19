import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

// ── Types ──

type CronFormat = '5-field' | '6-field';
type FieldType = 'every' | 'specific' | 'range' | 'interval';

interface FieldState {
  type: FieldType;
  specific: number[];
  rangeStart: number;
  rangeEnd: number;
  interval: number;
}

interface CronState {
  format: CronFormat;
  seconds: FieldState;
  minute: FieldState;
  hour: FieldState;
  dayOfMonth: FieldState;
  month: FieldState;
  dayOfWeek: FieldState;
}

// ── Constants ──

const FORMAT_OPTIONS = [
  { label: '5-Field', value: '5-field' },
  { label: '6-Field (seconds)', value: '6-field' },
];

const FIELD_COLORS: Record<string, string> = {
  seconds: '#ec4899',
  minute: '#0ea5e9',
  hour: '#10b981',
  dayOfMonth: '#f59e0b',
  month: '#8b5cf6',
  dayOfWeek: '#ef4444',
};

const FIELD_LABELS: Record<string, string> = {
  seconds: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  dayOfMonth: 'Day (Month)',
  month: 'Month',
  dayOfWeek: 'Day (Week)',
};

const FIELD_RANGES: Record<string, [number, number]> = {
  seconds: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_OPTIONS = [
  { label: 'Every', value: 'every' },
  { label: 'Specific', value: 'specific' },
  { label: 'Range', value: 'range' },
  { label: 'Interval', value: 'interval' },
];

interface Preset {
  label: string;
  expression: string;
}

const PRESETS: Preset[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Every 6 hours', expression: '0 */6 * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Daily at noon', expression: '0 12 * * *' },
  { label: 'Weekly on Monday', expression: '0 0 * * 1' },
  { label: 'Monthly on 1st', expression: '0 0 1 * *' },
  { label: 'Yearly (Jan 1st)', expression: '0 0 1 1 *' },
  { label: 'Weekdays at 9 AM', expression: '0 9 * * 1-5' },
  { label: 'Every 30 seconds', expression: '*/30 * * * * *' },
];

const LS_KEY = 'cron-gen-state';

// ── Helpers ──

function defaultFieldState(fieldKey: string): FieldState {
  const [min] = FIELD_RANGES[fieldKey];
  return {
    type: 'every',
    specific: [min],
    rangeStart: min,
    rangeEnd: min + 1,
    interval: fieldKey === 'minute' || fieldKey === 'seconds' ? 5 : 1,
  };
}

function defaultCronState(): CronState {
  return {
    format: '5-field',
    seconds: defaultFieldState('seconds'),
    minute: defaultFieldState('minute'),
    hour: defaultFieldState('hour'),
    dayOfMonth: defaultFieldState('dayOfMonth'),
    month: defaultFieldState('month'),
    dayOfWeek: defaultFieldState('dayOfWeek'),
  };
}

function fieldToExpression(field: FieldState, fieldKey: string): string {
  const [min, max] = FIELD_RANGES[fieldKey];
  switch (field.type) {
    case 'every':
      return '*';
    case 'specific':
      return field.specific.length > 0 ? field.specific.sort((a, b) => a - b).join(',') : '*';
    case 'range': {
      const s = Math.max(min, Math.min(max, field.rangeStart));
      const e = Math.max(min, Math.min(max, field.rangeEnd));
      return `${s}-${e}`;
    }
    case 'interval': {
      const iv = Math.max(1, field.interval);
      return `*/${iv}`;
    }
    default:
      return '*';
  }
}

function buildExpression(state: CronState): string {
  const parts: string[] = [];
  if (state.format === '6-field') {
    parts.push(fieldToExpression(state.seconds, 'seconds'));
  }
  parts.push(fieldToExpression(state.minute, 'minute'));
  parts.push(fieldToExpression(state.hour, 'hour'));
  parts.push(fieldToExpression(state.dayOfMonth, 'dayOfMonth'));
  parts.push(fieldToExpression(state.month, 'month'));
  parts.push(fieldToExpression(state.dayOfWeek, 'dayOfWeek'));
  return parts.join(' ');
}

function parseFieldExpression(expr: string, fieldKey: string): FieldState {
  const [min] = FIELD_RANGES[fieldKey];
  const trimmed = expr.trim();

  if (trimmed === '*') return { ...defaultFieldState(fieldKey), type: 'every' };

  // Interval: */n
  if (trimmed.startsWith('*/')) {
    const n = parseInt(trimmed.slice(2), 10);
    if (!isNaN(n) && n > 0) {
      return { ...defaultFieldState(fieldKey), type: 'interval', interval: n };
    }
  }

  // Range: a-b
  if (trimmed.includes('-') && !trimmed.includes(',')) {
    const [start, end] = trimmed.split('-').map(Number);
    if (!isNaN(start) && !isNaN(end)) {
      return { ...defaultFieldState(fieldKey), type: 'range', rangeStart: start, rangeEnd: end };
    }
  }

  // Specific: list of values
  if (/^[\d,]+$/.test(trimmed)) {
    const values = trimmed.split(',').map(Number).filter((n) => !isNaN(n));
    if (values.length > 0) {
      return { ...defaultFieldState(fieldKey), type: 'specific', specific: values };
    }
  }

  return { ...defaultFieldState(fieldKey), type: 'every' };
}

function parseCronExpression(expr: string): CronState | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    return {
      format: '5-field',
      seconds: defaultFieldState('seconds'),
      minute: parseFieldExpression(parts[0], 'minute'),
      hour: parseFieldExpression(parts[1], 'hour'),
      dayOfMonth: parseFieldExpression(parts[2], 'dayOfMonth'),
      month: parseFieldExpression(parts[3], 'month'),
      dayOfWeek: parseFieldExpression(parts[4], 'dayOfWeek'),
    };
  }
  if (parts.length === 6) {
    return {
      format: '6-field',
      seconds: parseFieldExpression(parts[0], 'seconds'),
      minute: parseFieldExpression(parts[1], 'minute'),
      hour: parseFieldExpression(parts[2], 'hour'),
      dayOfMonth: parseFieldExpression(parts[3], 'dayOfMonth'),
      month: parseFieldExpression(parts[4], 'month'),
      dayOfWeek: parseFieldExpression(parts[5], 'dayOfWeek'),
    };
  }
  return null;
}

function describeExpression(state: CronState): string {
  const parts: string[] = [];

  // Seconds
  if (state.format === '6-field') {
    const s = state.seconds;
    if (s.type === 'interval') parts.push(`every ${s.interval} second${s.interval !== 1 ? 's' : ''}`);
    else if (s.type === 'specific') parts.push(`at second${s.specific.length > 1 ? 's' : ''} ${s.specific.join(', ')}`);
    else if (s.type === 'range') parts.push(`seconds ${s.rangeStart}-${s.rangeEnd}`);
  }

  // Minute
  const m = state.minute;
  if (m.type === 'every' && state.hour.type === 'every') {
    parts.push('every minute');
  } else if (m.type === 'interval') {
    parts.push(`every ${m.interval} minute${m.interval !== 1 ? 's' : ''}`);
  } else if (m.type === 'specific') {
    const mins = m.specific.map((v) => String(v).padStart(2, '0'));
    if (state.hour.type !== 'every') {
      // Will be combined with hour
    } else {
      parts.push(`at minute${mins.length > 1 ? 's' : ''} ${mins.join(', ')}`);
    }
  } else if (m.type === 'range') {
    parts.push(`minutes ${m.rangeStart}-${m.rangeEnd}`);
  }

  // Hour
  const h = state.hour;
  if (h.type === 'interval') {
    parts.push(`every ${h.interval} hour${h.interval !== 1 ? 's' : ''}`);
  } else if (h.type === 'specific') {
    if (m.type === 'specific') {
      const times = h.specific.flatMap((hr) =>
        m.specific.map((min) => `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
      );
      // Replace minute description with combined time
      const mIdx = parts.findIndex((p) => p.startsWith('at minute'));
      if (mIdx >= 0) parts.splice(mIdx, 1);
      parts.push(`at ${times.join(', ')}`);
    } else {
      const hrs = h.specific.map((v) => {
        if (v === 0) return '12:00 AM';
        if (v === 12) return '12:00 PM';
        return v < 12 ? `${v}:00 AM` : `${v - 12}:00 PM`;
      });
      parts.push(`at ${hrs.join(', ')}`);
    }
  } else if (h.type === 'range') {
    parts.push(`hours ${h.rangeStart}-${h.rangeEnd}`);
  }

  // Day of month
  const dom = state.dayOfMonth;
  if (dom.type === 'specific') {
    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    parts.push(`on the ${dom.specific.map(ordinal).join(', ')}`);
  } else if (dom.type === 'range') {
    parts.push(`days ${dom.rangeStart}-${dom.rangeEnd} of the month`);
  } else if (dom.type === 'interval') {
    parts.push(`every ${dom.interval} day${dom.interval !== 1 ? 's' : ''}`);
  }

  // Month
  const mo = state.month;
  if (mo.type === 'specific') {
    parts.push(`in ${mo.specific.map((v) => MONTH_NAMES[v] || v).join(', ')}`);
  } else if (mo.type === 'range') {
    parts.push(`${MONTH_NAMES[mo.rangeStart]}-${MONTH_NAMES[mo.rangeEnd]}`);
  } else if (mo.type === 'interval') {
    parts.push(`every ${mo.interval} month${mo.interval !== 1 ? 's' : ''}`);
  }

  // Day of week
  const dow = state.dayOfWeek;
  if (dow.type === 'specific') {
    parts.push(`on ${dow.specific.map((v) => DAY_NAMES[v] || v).join(', ')}`);
  } else if (dow.type === 'range') {
    parts.push(`${DAY_NAMES[dow.rangeStart]}-${DAY_NAMES[dow.rangeEnd]}`);
  } else if (dow.type === 'interval') {
    parts.push(`every ${dow.interval} day${dow.interval !== 1 ? 's' : ''} of the week`);
  }

  if (parts.length === 0) return 'Every minute';
  return parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(', ');
}

function expandFieldValues(field: FieldState, fieldKey: string): number[] {
  const [min, max] = FIELD_RANGES[fieldKey];
  switch (field.type) {
    case 'every': {
      const arr: number[] = [];
      for (let i = min; i <= max; i++) arr.push(i);
      return arr;
    }
    case 'specific':
      return field.specific.filter((v) => v >= min && v <= max).sort((a, b) => a - b);
    case 'range': {
      const arr: number[] = [];
      const s = Math.max(min, field.rangeStart);
      const e = Math.min(max, field.rangeEnd);
      for (let i = s; i <= e; i++) arr.push(i);
      return arr;
    }
    case 'interval': {
      const arr: number[] = [];
      const step = Math.max(1, field.interval);
      for (let i = min; i <= max; i += step) arr.push(i);
      return arr;
    }
  }
}

function getNextRunTimes(state: CronState, count: number): Date[] {
  const results: Date[] = [];
  const now = new Date();
  const candidate = new Date(now);
  candidate.setMilliseconds(0);

  const minuteVals = expandFieldValues(state.minute, 'minute');
  const hourVals = expandFieldValues(state.hour, 'hour');
  const domVals = expandFieldValues(state.dayOfMonth, 'dayOfMonth');
  const monthVals = expandFieldValues(state.month, 'month');
  const dowVals = expandFieldValues(state.dayOfWeek, 'dayOfWeek');
  const secVals = state.format === '6-field' ? expandFieldValues(state.seconds, 'seconds') : [0];

  if (!minuteVals.length || !hourVals.length || !domVals.length || !monthVals.length || !dowVals.length || !secVals.length) {
    return results;
  }

  // Iterate from now forward, checking each minute (or second for 6-field)
  const step = state.format === '6-field' ? 1000 : 60000;
  candidate.setTime(now.getTime() + step);
  if (state.format !== '6-field') {
    candidate.setSeconds(0);
  }

  let iterations = 0;
  const maxIterations = 525960; // ~1 year of minutes

  while (results.length < count && iterations < maxIterations) {
    iterations++;
    const sec = candidate.getSeconds();
    const min = candidate.getMinutes();
    const hr = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1;
    const dow = candidate.getDay();

    if (
      secVals.includes(sec) &&
      minuteVals.includes(min) &&
      hourVals.includes(hr) &&
      domVals.includes(dom) &&
      monthVals.includes(mon) &&
      dowVals.includes(dow)
    ) {
      results.push(new Date(candidate));
    }

    candidate.setTime(candidate.getTime() + step);
  }

  return results;
}

function loadState(): CronState {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.minute) return parsed;
    }
  } catch { /* ignore */ }
  return defaultCronState();
}

function saveState(state: CronState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// ── Components ──

function FieldBuilder({
  fieldKey,
  field,
  onChange,
}: {
  fieldKey: string;
  field: FieldState;
  onChange: (f: FieldState) => void;
}) {
  const [min, max] = FIELD_RANGES[fieldKey];
  const color = FIELD_COLORS[fieldKey];
  const label = FIELD_LABELS[fieldKey];

  const handleTypeChange = useCallback((value: string) => {
    onChange({ ...field, type: value as FieldType });
  }, [field, onChange]);

  const toggleSpecific = useCallback((val: number) => {
    const curr = field.specific;
    const next = curr.includes(val) ? curr.filter((v) => v !== val) : [...curr, val];
    if (next.length === 0) return;
    onChange({ ...field, specific: next });
  }, [field, onChange]);

  // Build value labels
  const getValueLabel = (v: number): string => {
    if (fieldKey === 'month') return MONTH_NAMES[v] || String(v);
    if (fieldKey === 'dayOfWeek') return DAY_NAMES[v] || String(v);
    return String(v);
  };

  // Generate values to show for specific mode
  const allValues: number[] = [];
  for (let i = min; i <= max; i++) allValues.push(i);

  return (
    <div className={styles.fieldCard} style={{ borderColor: `color-mix(in srgb, ${color} 25%, var(--border))` }}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldDot} style={{ background: color }} />
        <span className={styles.fieldLabel}>{label}</span>
        <span className={styles.fieldExpr} style={{ color }}>
          {fieldToExpression(field, fieldKey)}
        </span>
      </div>

      <div className={styles.fieldTypeBar}>
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`${styles.fieldTypeBtn} ${field.type === opt.value ? styles.fieldTypeBtnActive : ''}`}
            style={field.type === opt.value ? { background: `color-mix(in srgb, ${color} 15%, var(--bg))`, color, borderColor: `color-mix(in srgb, ${color} 40%, var(--border))` } : undefined}
            onClick={() => handleTypeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {field.type === 'specific' && (
        <div className={styles.specificGrid}>
          {allValues.map((v) => (
            <button
              key={v}
              className={`${styles.specificBtn} ${field.specific.includes(v) ? styles.specificBtnActive : ''}`}
              style={field.specific.includes(v) ? { background: color, borderColor: color, color: '#fff' } : undefined}
              onClick={() => toggleSpecific(v)}
            >
              {getValueLabel(v)}
            </button>
          ))}
        </div>
      )}

      {field.type === 'range' && (
        <div className={styles.rangeRow}>
          <label className={styles.rangeLabel}>
            From
            <select
              className={styles.rangeSelect}
              value={field.rangeStart}
              onChange={(e) => onChange({ ...field, rangeStart: Number(e.target.value) })}
            >
              {allValues.map((v) => (
                <option key={v} value={v}>{getValueLabel(v)}</option>
              ))}
            </select>
          </label>
          <span className={styles.rangeSeparator}>to</span>
          <label className={styles.rangeLabel}>
            To
            <select
              className={styles.rangeSelect}
              value={field.rangeEnd}
              onChange={(e) => onChange({ ...field, rangeEnd: Number(e.target.value) })}
            >
              {allValues.map((v) => (
                <option key={v} value={v}>{getValueLabel(v)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {field.type === 'interval' && (
        <div className={styles.intervalRow}>
          <span className={styles.intervalPrefix}>Every</span>
          <input
            type="number"
            className={styles.intervalInput}
            value={field.interval}
            min={1}
            max={max}
            onChange={(e) => onChange({ ...field, interval: Math.max(1, Number(e.target.value)) })}
          />
          <span className={styles.intervalSuffix}>{label.toLowerCase()}{field.interval !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

// ── Main App ──

export default function App() {
  const savedState = useMemo(loadState, []);
  const [cronState, setCronState] = useState<CronState>(savedState);
  const [pasteInput, setPasteInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState('');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const expression = useMemo(() => buildExpression(cronState), [cronState]);
  const description = useMemo(() => describeExpression(cronState), [cronState]);
  const nextRuns = useMemo(() => getNextRunTimes(cronState, 10), [cronState]);

  useEffect(() => {
    saveState(cronState);
  }, [cronState]);

  const updateField = useCallback((fieldKey: string, field: FieldState) => {
    setCronState((prev) => ({ ...prev, [fieldKey]: field }));
  }, []);

  const handleFormatChange = useCallback((value: string) => {
    setCronState((prev) => ({ ...prev, format: value as CronFormat }));
    trackEvent('cron_format_change', { format: value });
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(expression);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      trackEvent('cron_copy');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, [expression]);

  const handleParse = useCallback(() => {
    if (!pasteInput.trim()) return;
    const parsed = parseCronExpression(pasteInput);
    if (parsed) {
      setCronState(parsed);
      setParseError('');
      trackEvent('cron_parse');
    } else {
      setParseError('Invalid cron expression. Expected 5 or 6 space-separated fields.');
    }
  }, [pasteInput]);

  const handlePreset = useCallback((preset: Preset) => {
    const parsed = parseCronExpression(preset.expression);
    if (parsed) {
      setCronState(parsed);
      setPasteInput('');
      setParseError('');
      trackEvent('cron_preset', { label: preset.label });
    }
  }, []);

  const handleReset = useCallback(() => {
    setCronState(defaultCronState());
    setPasteInput('');
    setParseError('');
  }, []);

  const fieldKeys = cronState.format === '6-field'
    ? ['seconds', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']
    : ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

  const expressionParts = expression.split(' ');
  const fieldKeysForHighlight = cronState.format === '6-field'
    ? ['seconds', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']
    : ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

  return (
    <Layout title="Cron Expression Generator">
      <div className={styles.container}>
        {/* Expression Output */}
        <Card variant="glass" className={`${styles.outputCard} animate-fadeInUp`}>
          <div className={styles.expressionRow}>
            <div className={styles.expressionParts}>
              {expressionParts.map((part, i) => (
                <span
                  key={i}
                  className={styles.expressionPart}
                  style={{ color: FIELD_COLORS[fieldKeysForHighlight[i]] }}
                >
                  {part}
                </span>
              ))}
            </div>
            <div className={styles.expressionActions}>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className={styles.description}>{description}</div>
          <div className={styles.fieldLegend}>
            {fieldKeysForHighlight.map((key, i) => (
              <span key={key} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: FIELD_COLORS[key] }} />
                <span className={styles.legendLabel}>{FIELD_LABELS[key]}</span>
              </span>
            ))}
          </div>
        </Card>

        {/* Format Toggle */}
        <div className={`${styles.formatBar} animate-fadeInUp`} style={{ animationDelay: '30ms' }}>
          <SegmentedControl
            options={FORMAT_OPTIONS}
            value={cronState.format}
            onChange={handleFormatChange}
          />
          <Button variant="secondary" onClick={handleReset}>Reset</Button>
        </div>

        {/* Reverse Mode */}
        <div className={`${styles.reverseSection} animate-fadeInUp`} style={{ animationDelay: '60ms' }}>
          <div className={styles.reverseInputRow}>
            <input
              type="text"
              className={styles.reverseInput}
              value={pasteInput}
              onChange={(e) => { setPasteInput(e.target.value); setParseError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleParse()}
              placeholder="Paste a cron expression to parse..."
              spellCheck={false}
            />
            <Button variant="primary" onClick={handleParse}>Parse</Button>
          </div>
          {parseError && <div className={styles.parseError}>{parseError}</div>}
        </div>

        {/* Presets */}
        <div className={`${styles.presetsSection} animate-fadeInUp`} style={{ animationDelay: '90ms' }}>
          <div className={styles.sectionTitle}>Presets</div>
          <div className={styles.presetGrid}>
            {PRESETS.map((p) => (
              <button
                key={p.expression}
                className={styles.presetBtn}
                onClick={() => handlePreset(p)}
              >
                <span className={styles.presetLabel}>{p.label}</span>
                <span className={styles.presetExpr}>{p.expression}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Field Builders */}
        <div className={`${styles.fieldsSection} animate-fadeInUp`} style={{ animationDelay: '120ms' }}>
          <div className={styles.sectionTitle}>Fields</div>
          <div className={styles.fieldsGrid}>
            {fieldKeys.map((key) => (
              <FieldBuilder
                key={key}
                fieldKey={key}
                field={cronState[key as keyof CronState] as FieldState}
                onChange={(f) => updateField(key, f)}
              />
            ))}
          </div>
        </div>

        {/* Next Run Times */}
        <div className={`${styles.runsSection} animate-fadeInUp`} style={{ animationDelay: '150ms' }}>
          <div className={styles.sectionTitle}>Next 10 Run Times</div>
          <Card className={styles.runsCard}>
            {nextRuns.length > 0 ? (
              <div className={styles.runsList}>
                {nextRuns.map((date, i) => (
                  <div key={i} className={styles.runItem}>
                    <span className={styles.runIndex}>{i + 1}</span>
                    <span className={styles.runDate}>
                      {date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                    <span className={styles.runTime}>
                      {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: cronState.format === '6-field' ? '2-digit' : undefined })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.noRuns}>No upcoming runs found within the next year</div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
