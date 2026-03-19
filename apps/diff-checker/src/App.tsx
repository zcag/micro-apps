import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

const STORAGE_KEY_ORIGINAL = 'diff-checker-original';
const STORAGE_KEY_MODIFIED = 'diff-checker-modified';

type ViewMode = 'side-by-side' | 'unified';
type ChangeType = 'equal' | 'added' | 'removed' | 'modified';

interface DiffLine {
  type: ChangeType;
  originalLine?: string;
  modifiedLine?: string;
  originalNum?: number;
  modifiedNum?: number;
}

interface CharDiff {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

// ── Myers diff algorithm (LCS-based) ──

function myersDiff(a: string[], b: string[]): Array<{ type: 'equal' | 'insert' | 'delete'; aIdx: number; bIdx: number }> {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) return [];

  const vSize = 2 * max + 1;
  const v = new Int32Array(vSize);
  v.fill(-1);
  const trace: Int32Array[] = [];

  v[max + 1] = 0;

  for (let d = 0; d <= max; d++) {
    const snapshot = new Int32Array(vSize);
    snapshot.set(v);
    trace.push(snapshot);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
        x = v[max + k + 1];
      } else {
        x = v[max + k - 1] + 1;
      }
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[max + k] = x;

      if (x >= n && y >= m) {
        // Backtrack
        const ops: Array<{ type: 'equal' | 'insert' | 'delete'; aIdx: number; bIdx: number }> = [];
        let cx = n;
        let cy = m;

        for (let dd = d; dd > 0; dd--) {
          const tv = trace[dd - 1];
          const ck = cx - cy;
          let prevK: number;

          if (ck === -dd || (ck !== dd && tv[max + ck - 1] < tv[max + ck + 1])) {
            prevK = ck + 1;
          } else {
            prevK = ck - 1;
          }

          const prevX = tv[max + prevK];
          const prevY = prevX - prevK;

          // Diagonal moves (equals)
          while (cx > prevX + (prevK < ck ? 0 : 1) && cy > prevY + (prevK < ck ? 1 : 0)) {
            cx--;
            cy--;
            ops.push({ type: 'equal', aIdx: cx, bIdx: cy });
          }

          if (dd > 0) {
            if (prevK < ck) {
              // Delete from a
              cx--;
              ops.push({ type: 'delete', aIdx: cx, bIdx: cy });
            } else {
              // Insert from b
              cy--;
              ops.push({ type: 'insert', aIdx: cx, bIdx: cy });
            }
          }
        }

        // Remaining diagonals at d=0
        while (cx > 0 && cy > 0) {
          cx--;
          cy--;
          ops.push({ type: 'equal', aIdx: cx, bIdx: cy });
        }

        ops.reverse();
        return ops;
      }
    }
  }

  // Fallback: delete all of a, insert all of b
  const ops: Array<{ type: 'equal' | 'insert' | 'delete'; aIdx: number; bIdx: number }> = [];
  for (let i = 0; i < n; i++) ops.push({ type: 'delete', aIdx: i, bIdx: 0 });
  for (let j = 0; j < m; j++) ops.push({ type: 'insert', aIdx: n, bIdx: j });
  return ops;
}

function normalizeForCompare(line: string, ignoreWhitespace: boolean, ignoreCase: boolean): string {
  let result = line;
  if (ignoreWhitespace) result = result.replace(/\s+/g, ' ').trim();
  if (ignoreCase) result = result.toLowerCase();
  return result;
}

function computeDiff(
  original: string,
  modified: string,
  ignoreWhitespace: boolean,
  ignoreCase: boolean
): { lines: DiffLine[]; stats: DiffStats } {
  const origLines = original ? original.split('\n') : [];
  const modLines = modified ? modified.split('\n') : [];

  const normOrig = origLines.map(l => normalizeForCompare(l, ignoreWhitespace, ignoreCase));
  const normMod = modLines.map(l => normalizeForCompare(l, ignoreWhitespace, ignoreCase));

  const ops = myersDiff(normOrig, normMod);

  const result: DiffLine[] = [];
  const stats: DiffStats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

  // Group sequential delete+insert pairs as "modified"
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'equal') {
      result.push({
        type: 'equal',
        originalLine: origLines[op.aIdx],
        modifiedLine: modLines[op.bIdx],
        originalNum: op.aIdx + 1,
        modifiedNum: op.bIdx + 1,
      });
      stats.unchanged++;
      i++;
    } else if (op.type === 'delete') {
      // Collect consecutive deletes
      const deletes: number[] = [];
      while (i < ops.length && ops[i].type === 'delete') {
        deletes.push(ops[i].aIdx);
        i++;
      }
      // Collect consecutive inserts
      const inserts: number[] = [];
      while (i < ops.length && ops[i].type === 'insert') {
        inserts.push(ops[i].bIdx);
        i++;
      }

      // Pair deletes and inserts as modifications
      const pairs = Math.min(deletes.length, inserts.length);
      for (let p = 0; p < pairs; p++) {
        result.push({
          type: 'modified',
          originalLine: origLines[deletes[p]],
          modifiedLine: modLines[inserts[p]],
          originalNum: deletes[p] + 1,
          modifiedNum: inserts[p] + 1,
        });
        stats.modified++;
      }
      // Remaining deletes
      for (let p = pairs; p < deletes.length; p++) {
        result.push({
          type: 'removed',
          originalLine: origLines[deletes[p]],
          originalNum: deletes[p] + 1,
        });
        stats.removed++;
      }
      // Remaining inserts
      for (let p = pairs; p < inserts.length; p++) {
        result.push({
          type: 'added',
          modifiedLine: modLines[inserts[p]],
          modifiedNum: inserts[p] + 1,
        });
        stats.added++;
      }
    } else {
      // insert without preceding delete
      result.push({
        type: 'added',
        modifiedLine: modLines[op.bIdx],
        modifiedNum: op.bIdx + 1,
      });
      stats.added++;
      i++;
    }
  }

  return { lines: result, stats };
}

// ── Character-level diff for modified lines ──

function charDiff(a: string, b: string): { original: CharDiff[]; modified: CharDiff[] } {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const ops = myersDiff(aChars, bChars);

  const origParts: CharDiff[] = [];
  const modParts: CharDiff[] = [];

  for (const op of ops) {
    if (op.type === 'equal') {
      // Merge with previous equal if possible
      const lastOrig = origParts[origParts.length - 1];
      const lastMod = modParts[modParts.length - 1];
      if (lastOrig && lastOrig.type === 'equal') {
        lastOrig.text += aChars[op.aIdx];
      } else {
        origParts.push({ type: 'equal', text: aChars[op.aIdx] });
      }
      if (lastMod && lastMod.type === 'equal') {
        lastMod.text += bChars[op.bIdx];
      } else {
        modParts.push({ type: 'equal', text: bChars[op.bIdx] });
      }
    } else if (op.type === 'delete') {
      const lastOrig = origParts[origParts.length - 1];
      if (lastOrig && lastOrig.type === 'removed') {
        lastOrig.text += aChars[op.aIdx];
      } else {
        origParts.push({ type: 'removed', text: aChars[op.aIdx] });
      }
    } else {
      const lastMod = modParts[modParts.length - 1];
      if (lastMod && lastMod.type === 'added') {
        lastMod.text += bChars[op.bIdx];
      } else {
        modParts.push({ type: 'added', text: bChars[op.bIdx] });
      }
    }
  }

  return { original: origParts, modified: modParts };
}

// ── Generate unified diff format string ──

function generateUnifiedDiff(diffLines: DiffLine[]): string {
  const lines: string[] = [];
  lines.push('--- Original');
  lines.push('+++ Modified');

  // Build hunks
  let hunkStart = -1;
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'equal' && hunkStart === -1) {
      hunkStart = Math.max(0, i - 3);
    }
    if (diffLines[i].type !== 'equal') {
      // Continue hunk
    }
    if (diffLines[i].type === 'equal' && hunkStart !== -1) {
      // Check if we're past the context window
      let nextChange = -1;
      for (let j = i + 1; j < diffLines.length; j++) {
        if (diffLines[j].type !== 'equal') {
          nextChange = j;
          break;
        }
      }
      if (nextChange === -1 || nextChange - i > 6) {
        // End hunk
        const hunkEnd = Math.min(diffLines.length, i + 3);
        const hunkLines = diffLines.slice(hunkStart, hunkEnd);
        const origStart = hunkLines.find(l => l.originalNum)?.originalNum || 1;
        const modStart = hunkLines.find(l => l.modifiedNum)?.modifiedNum || 1;
        let origCount = 0;
        let modCount = 0;
        const hunkContent: string[] = [];
        for (const line of hunkLines) {
          if (line.type === 'equal') {
            hunkContent.push(` ${line.originalLine ?? ''}`);
            origCount++;
            modCount++;
          } else if (line.type === 'removed') {
            hunkContent.push(`-${line.originalLine ?? ''}`);
            origCount++;
          } else if (line.type === 'added') {
            hunkContent.push(`+${line.modifiedLine ?? ''}`);
            modCount++;
          } else if (line.type === 'modified') {
            hunkContent.push(`-${line.originalLine ?? ''}`);
            hunkContent.push(`+${line.modifiedLine ?? ''}`);
            origCount++;
            modCount++;
          }
        }
        lines.push(`@@ -${origStart},${origCount} +${modStart},${modCount} @@`);
        lines.push(...hunkContent);
        hunkStart = -1;
      }
    }
  }

  // If hunk still open
  if (hunkStart !== -1) {
    const hunkLines = diffLines.slice(hunkStart);
    const origStart = hunkLines.find(l => l.originalNum)?.originalNum || 1;
    const modStart = hunkLines.find(l => l.modifiedNum)?.modifiedNum || 1;
    let origCount = 0;
    let modCount = 0;
    const hunkContent: string[] = [];
    for (const line of hunkLines) {
      if (line.type === 'equal') {
        hunkContent.push(` ${line.originalLine ?? ''}`);
        origCount++;
        modCount++;
      } else if (line.type === 'removed') {
        hunkContent.push(`-${line.originalLine ?? ''}`);
        origCount++;
      } else if (line.type === 'added') {
        hunkContent.push(`+${line.modifiedLine ?? ''}`);
        modCount++;
      } else if (line.type === 'modified') {
        hunkContent.push(`-${line.originalLine ?? ''}`);
        hunkContent.push(`+${line.modifiedLine ?? ''}`);
        origCount++;
        modCount++;
      }
    }
    lines.push(`@@ -${origStart},${origCount} +${modStart},${modCount} @@`);
    lines.push(...hunkContent);
  }

  return lines.join('\n');
}

// ── Inline char highlight component ──

function HighlightedLine({ parts, side }: { parts: CharDiff[]; side: 'original' | 'modified' }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'equal') {
          return <span key={i}>{part.text}</span>;
        }
        if (side === 'original' && part.type === 'removed') {
          return <span key={i} className={styles.charRemoved}>{part.text}</span>;
        }
        if (side === 'modified' && part.type === 'added') {
          return <span key={i} className={styles.charAdded}>{part.text}</span>;
        }
        return null;
      })}
    </>
  );
}

export default function App() {
  const [original, setOriginal] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ORIGINAL) || '';
    } catch { return ''; }
  });
  const [modified, setModified] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_MODIFIED) || '';
    } catch { return ''; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'original' | 'modified' | 'diff'>('original');
  const originalRef = useRef<HTMLDivElement>(null);
  const modifiedRef = useRef<HTMLDivElement>(null);
  const analyticsRef = useRef(false);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORIGINAL, original);
      localStorage.setItem(STORAGE_KEY_MODIFIED, modified);
    } catch { /* quota exceeded */ }
  }, [original, modified]);

  // Synchronized scrolling
  const scrollingRef = useRef<'original' | 'modified' | null>(null);

  const handleScroll = useCallback((source: 'original' | 'modified') => {
    if (scrollingRef.current && scrollingRef.current !== source) return;
    scrollingRef.current = source;

    const sourceEl = source === 'original' ? originalRef.current : modifiedRef.current;
    const targetEl = source === 'original' ? modifiedRef.current : originalRef.current;

    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop;
      targetEl.scrollLeft = sourceEl.scrollLeft;
    }

    requestAnimationFrame(() => {
      scrollingRef.current = null;
    });
  }, []);

  const hasContent = original.trim().length > 0 || modified.trim().length > 0;
  const hasBothInputs = original.trim().length > 0 && modified.trim().length > 0;

  const { lines: diffLines, stats } = useMemo(
    () => hasBothInputs
      ? computeDiff(original, modified, ignoreWhitespace, ignoreCase)
      : { lines: [] as DiffLine[], stats: { added: 0, removed: 0, modified: 0, unchanged: 0 } },
    [original, modified, ignoreWhitespace, ignoreCase, hasBothInputs]
  );

  // Track first diff
  if (hasBothInputs && diffLines.length > 0 && !analyticsRef.current) {
    trackEvent('diff_computed', { lines: String(diffLines.length) });
    analyticsRef.current = true;
  }
  if (!hasContent) analyticsRef.current = false;

  const handleCopyDiff = useCallback(() => {
    if (!hasBothInputs) return;
    const unified = generateUnifiedDiff(diffLines);
    navigator.clipboard.writeText(unified).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [diffLines, hasBothInputs]);

  const handleSwap = useCallback(() => {
    setOriginal(modified);
    setModified(original);
  }, [original, modified]);

  const handleClear = useCallback(() => {
    setOriginal('');
    setModified('');
  }, []);

  const isEmpty = !hasContent;

  return (
    <Layout title="Text Diff Checker">
      <div className={styles.container}>
        {/* Action bar */}
        <div className={styles.actionBar}>
          <div className={styles.actionGroup}>
            <Button variant="gradient" onClick={handleCopyDiff} haptic disabled={!hasBothInputs}>
              Copy Diff
            </Button>
            <button
              className={`${styles.actionBtn} ${copied ? styles.actionBtnSuccess : ''}`}
              onClick={handleCopyDiff}
              type="button"
              disabled={!hasBothInputs}
            >
              {copied ? '✓ Copied' : 'Unified'}
            </button>
            <button className={styles.actionBtn} onClick={handleSwap} type="button" disabled={isEmpty}>
              Swap
            </button>
            <button className={styles.actionBtn} onClick={handleClear} type="button" disabled={isEmpty}>
              Clear
            </button>
          </div>
          <div className={styles.actionGroup}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={ignoreWhitespace}
                onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                className={styles.toggleInput}
              />
              <span className={`${styles.toggleSwitch} ${ignoreWhitespace ? styles.toggleSwitchActive : ''}`} />
              <span className={styles.toggleText}>Ignore spaces</span>
            </label>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(e) => setIgnoreCase(e.target.checked)}
                className={styles.toggleInput}
              />
              <span className={`${styles.toggleSwitch} ${ignoreCase ? styles.toggleSwitchActive : ''}`} />
              <span className={styles.toggleText}>Ignore case</span>
            </label>
          </div>
        </div>

        {/* View mode toggle */}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewToggleBtn} ${viewMode === 'side-by-side' ? styles.viewToggleBtnActive : ''}`}
            onClick={() => setViewMode('side-by-side')}
            type="button"
          >
            Side by Side
          </button>
          <button
            className={`${styles.viewToggleBtn} ${viewMode === 'unified' ? styles.viewToggleBtnActive : ''}`}
            onClick={() => setViewMode('unified')}
            type="button"
          >
            Unified
          </button>
        </div>

        {/* Mobile tab toggle */}
        <div className={styles.mobileToggle}>
          <button
            className={`${styles.mobileToggleBtn} ${activeTab === 'original' ? styles.mobileToggleBtnActive : ''}`}
            onClick={() => setActiveTab('original')}
            type="button"
          >
            Original
          </button>
          <button
            className={`${styles.mobileToggleBtn} ${activeTab === 'modified' ? styles.mobileToggleBtnActive : ''}`}
            onClick={() => setActiveTab('modified')}
            type="button"
          >
            Modified
          </button>
          <button
            className={`${styles.mobileToggleBtn} ${activeTab === 'diff' ? styles.mobileToggleBtnActive : ''}`}
            onClick={() => setActiveTab('diff')}
            type="button"
            disabled={!hasBothInputs}
          >
            Diff
          </button>
        </div>

        {/* Input panels */}
        <div className={styles.splitPane}>
          <div className={`${styles.pane} ${styles.originalPane} ${activeTab !== 'original' && activeTab !== 'diff' ? styles.paneHiddenMobile : ''} ${activeTab === 'diff' ? styles.paneHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>📄</span>
                  <span>Original</span>
                </div>
                <span className={styles.lineCount}>{original ? original.split('\n').length : 0} lines</span>
              </div>
              <textarea
                className={styles.editor}
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
                placeholder="Paste or type the original text here..."
                spellCheck={false}
              />
            </Card>
          </div>
          <div className={`${styles.pane} ${styles.modifiedPane} ${activeTab !== 'modified' ? styles.paneHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>📝</span>
                  <span>Modified</span>
                </div>
                <span className={styles.lineCount}>{modified ? modified.split('\n').length : 0} lines</span>
              </div>
              <textarea
                className={styles.editor}
                value={modified}
                onChange={(e) => setModified(e.target.value)}
                placeholder="Paste or type the modified text here..."
                spellCheck={false}
              />
            </Card>
          </div>
        </div>

        {/* Stats */}
        {hasBothInputs && (
          <div className={styles.statsRow}>
            <div className={`${styles.statCard} ${styles.statAdded}`}>
              <span className={styles.statValue}>{stats.added}</span>
              <span className={styles.statLabel}>Added</span>
            </div>
            <div className={`${styles.statCard} ${styles.statRemoved}`}>
              <span className={styles.statValue}>{stats.removed}</span>
              <span className={styles.statLabel}>Removed</span>
            </div>
            <div className={`${styles.statCard} ${styles.statModified}`}>
              <span className={styles.statValue}>{stats.modified}</span>
              <span className={styles.statLabel}>Modified</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.unchanged}</span>
              <span className={styles.statLabel}>Unchanged</span>
            </div>
          </div>
        )}

        {/* Diff output */}
        {hasBothInputs && diffLines.length > 0 && viewMode === 'side-by-side' && (
          <div className={`${styles.diffSection} ${activeTab !== 'diff' ? styles.diffHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>⇄</span>
                  <span>Differences</span>
                </div>
              </div>
              <div className={styles.sideBySide}>
                <div
                  className={styles.diffPanel}
                  ref={originalRef}
                  onScroll={() => handleScroll('original')}
                >
                  {diffLines.map((line, i) => (
                    <div
                      key={i}
                      className={`${styles.diffLine} ${
                        line.type === 'removed' ? styles.diffLineRemoved :
                        line.type === 'modified' ? styles.diffLineModified :
                        line.type === 'added' ? styles.diffLineEmpty :
                        ''
                      }`}
                    >
                      <span className={styles.diffLineNum}>
                        {line.originalNum ?? ''}
                      </span>
                      <span className={styles.diffGutter}>
                        {line.type === 'removed' ? '−' : line.type === 'modified' ? '~' : line.type === 'added' ? '' : ''}
                      </span>
                      <span className={styles.diffContent}>
                        {line.type === 'modified' && line.originalLine !== undefined
                          ? <HighlightedLine parts={charDiff(line.originalLine, line.modifiedLine!).original} side="original" />
                          : line.type === 'added'
                            ? ''
                            : line.originalLine ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className={styles.diffPanel}
                  ref={modifiedRef}
                  onScroll={() => handleScroll('modified')}
                >
                  {diffLines.map((line, i) => (
                    <div
                      key={i}
                      className={`${styles.diffLine} ${
                        line.type === 'added' ? styles.diffLineAdded :
                        line.type === 'modified' ? styles.diffLineModified :
                        line.type === 'removed' ? styles.diffLineEmpty :
                        ''
                      }`}
                    >
                      <span className={styles.diffLineNum}>
                        {line.modifiedNum ?? ''}
                      </span>
                      <span className={styles.diffGutter}>
                        {line.type === 'added' ? '+' : line.type === 'modified' ? '~' : line.type === 'removed' ? '' : ''}
                      </span>
                      <span className={styles.diffContent}>
                        {line.type === 'modified' && line.modifiedLine !== undefined
                          ? <HighlightedLine parts={charDiff(line.originalLine!, line.modifiedLine).modified} side="modified" />
                          : line.type === 'removed'
                            ? ''
                            : line.modifiedLine ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Unified diff view */}
        {hasBothInputs && diffLines.length > 0 && viewMode === 'unified' && (
          <div className={`${styles.diffSection} ${activeTab !== 'diff' ? styles.diffHiddenMobile : ''}`}>
            <Card>
              <div className={styles.paneHeader}>
                <div className={styles.paneTitle}>
                  <span className={styles.paneTitleIcon}>⇄</span>
                  <span>Unified Diff</span>
                </div>
              </div>
              <div className={styles.unifiedPanel}>
                {diffLines.map((line, i) => {
                  if (line.type === 'equal') {
                    return (
                      <div key={i} className={styles.diffLine}>
                        <span className={styles.diffLineNum}>{line.originalNum}</span>
                        <span className={styles.diffLineNum}>{line.modifiedNum}</span>
                        <span className={styles.diffGutter}> </span>
                        <span className={styles.diffContent}>{line.originalLine}</span>
                      </div>
                    );
                  }
                  if (line.type === 'removed') {
                    return (
                      <div key={i} className={`${styles.diffLine} ${styles.diffLineRemoved}`}>
                        <span className={styles.diffLineNum}>{line.originalNum}</span>
                        <span className={styles.diffLineNum}></span>
                        <span className={styles.diffGutter}>−</span>
                        <span className={styles.diffContent}>{line.originalLine}</span>
                      </div>
                    );
                  }
                  if (line.type === 'added') {
                    return (
                      <div key={i} className={`${styles.diffLine} ${styles.diffLineAdded}`}>
                        <span className={styles.diffLineNum}></span>
                        <span className={styles.diffLineNum}>{line.modifiedNum}</span>
                        <span className={styles.diffGutter}>+</span>
                        <span className={styles.diffContent}>{line.modifiedLine}</span>
                      </div>
                    );
                  }
                  // modified: show both lines
                  const cd = charDiff(line.originalLine!, line.modifiedLine!);
                  return (
                    <div key={i}>
                      <div className={`${styles.diffLine} ${styles.diffLineRemoved}`}>
                        <span className={styles.diffLineNum}>{line.originalNum}</span>
                        <span className={styles.diffLineNum}></span>
                        <span className={styles.diffGutter}>−</span>
                        <span className={styles.diffContent}>
                          <HighlightedLine parts={cd.original} side="original" />
                        </span>
                      </div>
                      <div className={`${styles.diffLine} ${styles.diffLineAdded}`}>
                        <span className={styles.diffLineNum}></span>
                        <span className={styles.diffLineNum}>{line.modifiedNum}</span>
                        <span className={styles.diffGutter}>+</span>
                        <span className={styles.diffContent}>
                          <HighlightedLine parts={cd.modified} side="modified" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>⇄</div>
              <div className={styles.emptyStateText}>Paste text in both panels to compare</div>
              <div className={styles.emptyStateHint}>
                side-by-side diff, character-level highlighting, unified view & more
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
