import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type Mode = 'match' | 'replace';
type Flag = 'g' | 'i' | 'm' | 's' | 'u';

interface MatchResult {
  fullMatch: string;
  groups: string[];
  index: number;
  length: number;
}

interface PatternPreset {
  name: string;
  pattern: string;
  flags: string;
  description: string;
}

const STORAGE_KEY = 'regex-tester-state';

const FLAGS: { flag: Flag; label: string; description: string }[] = [
  { flag: 'g', label: 'g', description: 'Global' },
  { flag: 'i', label: 'i', description: 'Case insensitive' },
  { flag: 'm', label: 'm', description: 'Multiline' },
  { flag: 's', label: 's', description: 'Dot matches newline' },
  { flag: 'u', label: 'u', description: 'Unicode' },
];

const COMMON_PATTERNS: PatternPreset[] = [
  { name: 'Email', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', flags: 'gi', description: 'Match email addresses' },
  { name: 'URL', pattern: 'https?://[\\w\\-._~:/?#\\[\\]@!$&\'()*+,;=%]+', flags: 'gi', description: 'Match HTTP/HTTPS URLs' },
  { name: 'Phone (US)', pattern: '\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}', flags: 'g', description: 'Match US phone numbers' },
  { name: 'Date (YYYY-MM-DD)', pattern: '\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])', flags: 'g', description: 'Match ISO date format' },
  { name: 'IPv4 Address', pattern: '\\b(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b', flags: 'g', description: 'Match IPv4 addresses' },
  { name: 'Hex Color', pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b', flags: 'gi', description: 'Match hex color codes' },
  { name: 'HTML Tag', pattern: '<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*>.*?</\\1>', flags: 'gs', description: 'Match HTML tags with content' },
  { name: 'Integer', pattern: '-?\\d+', flags: 'g', description: 'Match positive or negative integers' },
  { name: 'Whitespace Runs', pattern: '\\s{2,}', flags: 'g', description: 'Match 2+ consecutive whitespace characters' },
  { name: 'Word', pattern: '\\b\\w+\\b', flags: 'g', description: 'Match individual words' },
];

function loadState(): { pattern: string; testString: string; flags: Set<Flag>; replaceWith: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      return {
        pattern: data.pattern || '',
        testString: data.testString || '',
        flags: new Set((data.flags || ['g']) as Flag[]),
        replaceWith: data.replaceWith || '',
      };
    }
  } catch {}
  return { pattern: '', testString: '', flags: new Set<Flag>(['g']), replaceWith: '' };
}

function saveState(pattern: string, testString: string, flags: Set<Flag>, replaceWith: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pattern,
      testString,
      flags: Array.from(flags),
      replaceWith,
    }));
  } catch {}
}

/** Break down a regex pattern into human-readable explanation segments */
function explainRegex(pattern: string): string[] {
  if (!pattern) return [];
  const explanations: string[] = [];
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    const rest = pattern.slice(i);

    // Character classes
    if (rest.startsWith('\\d')) { explanations.push('\\d - Any digit (0-9)'); i += 2; }
    else if (rest.startsWith('\\D')) { explanations.push('\\D - Any non-digit'); i += 2; }
    else if (rest.startsWith('\\w')) { explanations.push('\\w - Any word character (a-z, A-Z, 0-9, _)'); i += 2; }
    else if (rest.startsWith('\\W')) { explanations.push('\\W - Any non-word character'); i += 2; }
    else if (rest.startsWith('\\s')) { explanations.push('\\s - Any whitespace'); i += 2; }
    else if (rest.startsWith('\\S')) { explanations.push('\\S - Any non-whitespace'); i += 2; }
    else if (rest.startsWith('\\b')) { explanations.push('\\b - Word boundary'); i += 2; }
    else if (rest.startsWith('\\B')) { explanations.push('\\B - Non-word boundary'); i += 2; }
    else if (rest.startsWith('\\n')) { explanations.push('\\n - Newline'); i += 2; }
    else if (rest.startsWith('\\t')) { explanations.push('\\t - Tab'); i += 2; }
    else if (rest.startsWith('\\r')) { explanations.push('\\r - Carriage return'); i += 2; }
    else if (ch === '\\' && i + 1 < pattern.length) {
      explanations.push(`\\${pattern[i + 1]} - Escaped "${pattern[i + 1]}"`);
      i += 2;
    }
    // Brackets (character class)
    else if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end !== -1) {
        const cls = pattern.slice(i, end + 1);
        const negated = cls[1] === '^';
        explanations.push(`${cls} - ${negated ? 'Any character NOT in' : 'Any character in'} set`);
        i = end + 1;
      } else {
        explanations.push('[ - Opening bracket (unclosed)');
        i++;
      }
    }
    // Quantifiers
    else if (ch === '{') {
      const qMatch = rest.match(/^\{(\d+)(?:,(\d*))?\}/);
      if (qMatch) {
        const min = qMatch[1];
        const max = qMatch[2];
        if (max === undefined) explanations.push(`{${min}} - Exactly ${min} times`);
        else if (max === '') explanations.push(`{${min},} - ${min} or more times`);
        else explanations.push(`{${min},${max}} - Between ${min} and ${max} times`);
        i += qMatch[0].length;
      } else {
        explanations.push('{ - Literal brace');
        i++;
      }
    }
    // Groups
    else if (ch === '(') {
      if (rest.startsWith('(?:')) { explanations.push('(?:...) - Non-capturing group'); i += 3; }
      else if (rest.startsWith('(?=')) { explanations.push('(?=...) - Positive lookahead'); i += 3; }
      else if (rest.startsWith('(?!')) { explanations.push('(?!...) - Negative lookahead'); i += 3; }
      else if (rest.startsWith('(?<=')) { explanations.push('(?<=...) - Positive lookbehind'); i += 4; }
      else if (rest.startsWith('(?<!')) { explanations.push('(?<!...) - Negative lookbehind'); i += 4; }
      else { explanations.push('( - Capturing group start'); i++; }
    }
    else if (ch === ')') { explanations.push(') - Group end'); i++; }
    // Anchors & special
    else if (ch === '^') { explanations.push('^ - Start of string/line'); i++; }
    else if (ch === '$') { explanations.push('$ - End of string/line'); i++; }
    else if (ch === '.') { explanations.push('. - Any character (except newline)'); i++; }
    else if (ch === '*') {
      const lazy = pattern[i + 1] === '?';
      explanations.push(lazy ? '*? - Zero or more times (lazy)' : '* - Zero or more times (greedy)');
      i += lazy ? 2 : 1;
    }
    else if (ch === '+') {
      const lazy = pattern[i + 1] === '?';
      explanations.push(lazy ? '+? - One or more times (lazy)' : '+ - One or more times (greedy)');
      i += lazy ? 2 : 1;
    }
    else if (ch === '?') {
      explanations.push('? - Optional (zero or one)');
      i++;
    }
    else if (ch === '|') { explanations.push('| - OR (alternation)'); i++; }
    else {
      // Collect consecutive literal characters
      let literal = '';
      while (i < pattern.length && !/[\\[\]{}()*+?.^$|]/.test(pattern[i])) {
        literal += pattern[i];
        i++;
      }
      if (literal.length > 1) explanations.push(`${literal} - Literal text "${literal}"`);
      else if (literal.length === 1) explanations.push(`${literal} - Literal "${literal}"`);
    }
  }
  return explanations;
}

export default function App() {
  const initial = useRef(loadState());
  const [pattern, setPattern] = useState(initial.current.pattern);
  const [testString, setTestString] = useState(initial.current.testString);
  const [activeFlags, setActiveFlags] = useState<Set<Flag>>(initial.current.flags);
  const [mode, setMode] = useState<Mode>('match');
  const [replaceWith, setReplaceWith] = useState(initial.current.replaceWith);
  const [copiedMatches, setCopiedMatches] = useState(false);
  const [copiedReplace, setCopiedReplace] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const analyticsRef = useRef(false);

  // Save state on change
  useEffect(() => {
    saveState(pattern, testString, activeFlags, replaceWith);
  }, [pattern, testString, activeFlags, replaceWith]);

  const toggleFlag = useCallback((flag: Flag) => {
    setActiveFlags(prev => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }, []);

  const flagString = useMemo(() => Array.from(activeFlags).sort().join(''), [activeFlags]);

  // Build regex and compute matches
  const { regex, regexError } = useMemo(() => {
    if (!pattern) return { regex: null, regexError: null };
    try {
      const r = new RegExp(pattern, flagString);
      return { regex: r, regexError: null };
    } catch (e) {
      return { regex: null, regexError: (e as Error).message };
    }
  }, [pattern, flagString]);

  const matches = useMemo<MatchResult[]>(() => {
    if (!regex || !testString) return [];
    const results: MatchResult[] = [];
    if (activeFlags.has('g')) {
      let m: RegExpExecArray | null;
      const r = new RegExp(regex.source, regex.flags);
      while ((m = r.exec(testString)) !== null) {
        results.push({
          fullMatch: m[0],
          groups: m.slice(1),
          index: m.index,
          length: m[0].length,
        });
        if (m[0].length === 0) r.lastIndex++;
        if (results.length > 500) break;
      }
    } else {
      const m = regex.exec(testString);
      if (m) {
        results.push({
          fullMatch: m[0],
          groups: m.slice(1),
          index: m.index,
          length: m[0].length,
        });
      }
    }
    return results;
  }, [regex, testString, activeFlags]);

  // Track first match
  if (matches.length > 0 && !analyticsRef.current) {
    trackEvent('regex_tested', { matchCount: String(matches.length) });
    analyticsRef.current = true;
  }
  if (!pattern && !testString) analyticsRef.current = false;

  // Highlighted test string with match spans
  const highlightedTest = useMemo(() => {
    if (!testString) return '';
    if (!regex || matches.length === 0) return escapeHtml(testString);

    const parts: string[] = [];
    let lastEnd = 0;
    const colors = ['var(--highlight-1)', 'var(--highlight-2)', 'var(--highlight-3)'];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (match.index > lastEnd) {
        parts.push(escapeHtml(testString.slice(lastEnd, match.index)));
      }
      const colorIdx = i % colors.length;
      parts.push(
        `<mark class="${styles.highlight}" style="--hl-color: ${colors[colorIdx]}">${escapeHtml(match.fullMatch)}</mark>`
      );
      lastEnd = match.index + match.length;
    }
    if (lastEnd < testString.length) {
      parts.push(escapeHtml(testString.slice(lastEnd)));
    }
    return parts.join('');
  }, [testString, regex, matches]);

  // Replace result
  const replaceResult = useMemo(() => {
    if (!regex || !testString || mode !== 'replace') return '';
    try {
      return testString.replace(regex, replaceWith);
    } catch {
      return '';
    }
  }, [regex, testString, replaceWith, mode]);

  // Explanation
  const explanation = useMemo(() => explainRegex(pattern), [pattern]);

  const handleLoadPreset = useCallback((preset: PatternPreset) => {
    setPattern(preset.pattern);
    const newFlags = new Set<Flag>();
    for (const f of preset.flags) {
      if (['g', 'i', 'm', 's', 'u'].includes(f)) newFlags.add(f as Flag);
    }
    setActiveFlags(newFlags);
    setShowPatterns(false);
  }, []);

  const handleCopyMatches = useCallback(() => {
    const text = matches.map(m => m.fullMatch).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMatches(true);
      setTimeout(() => setCopiedMatches(false), 1500);
    }).catch(() => {});
  }, [matches]);

  const handleCopyReplace = useCallback(() => {
    navigator.clipboard.writeText(replaceResult).then(() => {
      setCopiedReplace(true);
      setTimeout(() => setCopiedReplace(false), 1500);
    }).catch(() => {});
  }, [replaceResult]);

  const handleClear = useCallback(() => {
    setPattern('');
    setTestString('');
    setReplaceWith('');
    setActiveFlags(new Set<Flag>(['g']));
  }, []);

  const isEmpty = !pattern && !testString;

  return (
    <Layout title="Regex Tester">
      <div className={styles.container}>
        {/* Regex Input */}
        <Card>
          <div className={styles.regexHeader}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>/.*/ </span>
              <span>Pattern</span>
            </div>
            <div className={styles.headerActions}>
              <button
                className={`${styles.actionBtn} ${showPatterns ? styles.actionBtnActive : ''}`}
                onClick={() => setShowPatterns(!showPatterns)}
                type="button"
              >
                Presets
              </button>
              <button className={styles.actionBtn} onClick={handleClear} type="button" disabled={isEmpty}>
                Clear
              </button>
            </div>
          </div>

          <div className={styles.regexInputRow}>
            <span className={styles.regexDelimiter}>/</span>
            <input
              className={styles.regexInput}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Enter regex pattern..."
              spellCheck={false}
              autoComplete="off"
            />
            <span className={styles.regexDelimiter}>/</span>
            <div className={styles.flagGroup}>
              {FLAGS.map(({ flag, label, description }) => (
                <button
                  key={flag}
                  className={`${styles.flagBtn} ${activeFlags.has(flag) ? styles.flagBtnActive : ''}`}
                  onClick={() => toggleFlag(flag)}
                  title={description}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {regexError && (
            <div className={styles.errorBar}>
              <span className={styles.errorIcon}>!</span>
              <span className={styles.errorText}>{regexError}</span>
            </div>
          )}

          {regex && !regexError && pattern && (
            <div className={styles.validBar}>
              <span className={styles.validIcon}>&#10003;</span>
              <span className={styles.validText}>
                Valid pattern &middot; {matches.length} match{matches.length !== 1 ? 'es' : ''}
              </span>
            </div>
          )}
        </Card>

        {/* Common Patterns Dropdown */}
        {showPatterns && (
          <Card>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>&#9776;</span>
              <span>Common Patterns</span>
            </div>
            <div className={styles.presetGrid}>
              {COMMON_PATTERNS.map((preset) => (
                <button
                  key={preset.name}
                  className={styles.presetCard}
                  onClick={() => handleLoadPreset(preset)}
                  type="button"
                >
                  <span className={styles.presetName}>{preset.name}</span>
                  <span className={styles.presetDesc}>{preset.description}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Mode Toggle */}
        <SegmentedControl
          options={[
            { label: 'Match', value: 'match' as Mode },
            { label: 'Replace', value: 'replace' as Mode },
          ]}
          value={mode}
          onChange={setMode}
        />

        {/* Test String */}
        <Card>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>Aa</span>
            <span>Test String</span>
          </div>
          <div className={styles.testStringContainer}>
            <div
              className={styles.testStringHighlight}
              dangerouslySetInnerHTML={{ __html: highlightedTest || '<span class="' + styles.placeholder + '">Enter test string...</span>' }}
            />
            <textarea
              className={styles.testStringInput}
              value={testString}
              onChange={(e) => setTestString(e.target.value)}
              placeholder="Enter test string..."
              spellCheck={false}
              rows={6}
            />
          </div>
        </Card>

        {/* Replace Mode */}
        {mode === 'replace' && (
          <Card>
            <div className={styles.replaceHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>&#8644;</span>
                <span>Replace With</span>
              </div>
              <button
                className={`${styles.actionBtn} ${copiedReplace ? styles.actionBtnSuccess : ''}`}
                onClick={handleCopyReplace}
                type="button"
                disabled={!replaceResult}
              >
                {copiedReplace ? '&#10003; Copied' : 'Copy Result'}
              </button>
            </div>
            <input
              className={styles.replaceInput}
              type="text"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              placeholder="Replacement string (use $1, $2 for groups)..."
              spellCheck={false}
            />
            {replaceResult && (
              <div className={styles.replacePreview}>
                <div className={styles.replacePreviewLabel}>Result:</div>
                <pre className={styles.replacePreviewText}>{replaceResult}</pre>
              </div>
            )}
          </Card>
        )}

        {/* Match Results */}
        {matches.length > 0 && mode === 'match' && (
          <Card>
            <div className={styles.matchHeader}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>&#9679;</span>
                <span>Matches ({matches.length})</span>
              </div>
              <button
                className={`${styles.actionBtn} ${copiedMatches ? styles.actionBtnSuccess : ''}`}
                onClick={handleCopyMatches}
                type="button"
              >
                {copiedMatches ? '&#10003; Copied' : 'Copy All'}
              </button>
            </div>
            <div className={styles.matchList}>
              {matches.map((match, idx) => (
                <div key={idx} className={styles.matchItem}>
                  <div className={styles.matchIndex}>
                    <span className={styles.matchBadge}>#{idx + 1}</span>
                    <span className={styles.matchPosition}>index {match.index}</span>
                  </div>
                  <div className={styles.matchValue}>{match.fullMatch || '(empty string)'}</div>
                  {match.groups.length > 0 && (
                    <div className={styles.matchGroups}>
                      {match.groups.map((g, gi) => (
                        <div key={gi} className={styles.groupItem}>
                          <span className={styles.groupLabel}>Group {gi + 1}:</span>
                          <span className={styles.groupValue}>{g ?? '(undefined)'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Regex Explanation */}
        {explanation.length > 0 && (
          <Card>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>?</span>
              <span>Pattern Explanation</span>
            </div>
            <div className={styles.explanationList}>
              {explanation.map((item, idx) => {
                const [token, ...descParts] = item.split(' - ');
                const desc = descParts.join(' - ');
                return (
                  <div key={idx} className={styles.explanationItem}>
                    <code className={styles.explanationToken}>{token}</code>
                    <span className={styles.explanationDesc}>{desc}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Empty State */}
        {isEmpty && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>/.*/ </div>
              <div className={styles.emptyStateText}>Enter a regex pattern and test string</div>
              <div className={styles.emptyStateHint}>
                Real-time matching, replace mode, pattern library & explanations
              </div>
              <div className={styles.emptyStateActions}>
                <Button variant="gradient" onClick={() => setShowPatterns(true)} haptic>
                  Browse Patterns
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}
