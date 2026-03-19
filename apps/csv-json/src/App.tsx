import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, SegmentedControl, Button, trackEvent } from '@micro-apps/shared';
import { parseCSV, csvToJSON, jsonToCSV, detectDelimiter, type Delimiter, type ParseOptions, type ParseResult } from './csv-parser';
import styles from './App.module.css';

type Mode = 'csv-to-json' | 'json-to-csv';
type JsonIndent = '' | '  ' | '    ' | '\t';
type SortDir = 'asc' | 'desc';

const MODE_OPTIONS = [
  { label: 'CSV → JSON', value: 'csv-to-json' },
  { label: 'JSON → CSV', value: 'json-to-csv' },
];

const DELIMITER_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Comma', value: ',' },
  { label: 'Semi', value: ';' },
  { label: 'Tab', value: '\t' },
  { label: 'Pipe', value: '|' },
];

const INDENT_OPTIONS = [
  { label: 'Min', value: '' },
  { label: '2-space', value: '  ' },
  { label: '4-space', value: '    ' },
  { label: 'Tab', value: '\t' },
];

const LS_KEY = 'csv-json-state';

function loadState(): { input: string; mode: Mode } {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { input: parsed.input || '', mode: parsed.mode || 'csv-to-json' };
    }
  } catch { /* ignore */ }
  return { input: '', mode: 'csv-to-json' };
}

function saveState(input: string, mode: Mode) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ input, mode }));
  } catch { /* ignore */ }
}

const CSV_SAMPLE = `Name,Age,City,Email
Alice Johnson,28,New York,alice@example.com
Bob Smith,35,San Francisco,bob@example.com
"Carol, MD",42,Chicago,carol@example.com
David Lee,31,"Los Angeles",david@example.com`;

const JSON_SAMPLE = `[
  {"name": "Alice Johnson", "age": 28, "city": "New York"},
  {"name": "Bob Smith", "age": 35, "city": "San Francisco"},
  {"name": "Carol, MD", "age": 42, "city": "Chicago"},
  {"name": "David Lee", "age": 31, "city": "Los Angeles"}
]`;

export default function App() {
  const saved = useMemo(loadState, []);
  const [mode, setMode] = useState<Mode>(saved.mode);
  const [input, setInput] = useState(saved.input);
  const [delimiter, setDelimiter] = useState<Delimiter | 'auto'>('auto');
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [jsonIndent, setJsonIndent] = useState<JsonIndent>('  ');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showTable, setShowTable] = useState(true);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Compute output
  const result = useMemo(() => {
    if (!input.trim()) {
      return { output: '', headers: [] as string[], rows: [] as string[][], detectedDelimiter: ',' as Delimiter };
    }

    try {
      if (mode === 'csv-to-json') {
        const options: ParseOptions = { delimiter, firstRowHeaders, trimWhitespace, skipEmptyRows };
        const parsed = parseCSV(input, options);
        const json = csvToJSON(parsed, jsonIndent);
        return { output: json, headers: parsed.headers, rows: parsed.rows, detectedDelimiter: parsed.delimiter };
      } else {
        const outputDelimiter = delimiter === 'auto' ? ',' : delimiter;
        const { csv, headers, rows } = jsonToCSV(input, outputDelimiter);
        return { output: csv, headers, rows, detectedDelimiter: outputDelimiter };
      }
    } catch (e) {
      return { output: '', headers: [] as string[], rows: [] as string[][], error: (e as Error).message, detectedDelimiter: ',' as Delimiter };
    }
  }, [input, mode, delimiter, firstRowHeaders, trimWhitespace, skipEmptyRows, jsonIndent]);

  useEffect(() => {
    setError(result.error || null);
  }, [result.error]);

  useEffect(() => {
    if (input.trim()) saveState(input, mode);
  }, [input, mode]);

  // Sorted rows for table
  const sortedRows = useMemo(() => {
    if (sortCol === null || result.rows.length === 0) return result.rows;
    return [...result.rows].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      // Try numeric comparison
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) {
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [result.rows, sortCol, sortDir]);

  const handleModeChange = useCallback((value: string) => {
    setMode(value as Mode);
    setInput('');
    setError(null);
    setSortCol(null);
    trackEvent('csv_json_mode_change', { mode: value });
  }, []);

  const handleSort = useCallback((colIndex: number) => {
    if (sortCol === colIndex) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colIndex);
      setSortDir('asc');
    }
  }, [sortCol]);

  const handleCopy = useCallback(async () => {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      trackEvent('csv_json_copy');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, [result.output]);

  const handleDownload = useCallback(() => {
    if (!result.output) return;
    const ext = mode === 'csv-to-json' ? 'json' : 'csv';
    const mime = mode === 'csv-to-json' ? 'application/json' : 'text/csv';
    const blob = new Blob([result.output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    trackEvent('csv_json_download', { format: ext });
  }, [result.output, mode]);

  const handleClear = useCallback(() => {
    setInput('');
    setError(null);
    setSortCol(null);
    saveState('', mode);
  }, [mode]);

  const handleLoadSample = useCallback(() => {
    setInput(mode === 'csv-to-json' ? CSV_SAMPLE : JSON_SAMPLE);
    setSortCol(null);
    trackEvent('csv_json_sample');
  }, [mode]);

  const rowCount = result.rows.length;
  const colCount = result.headers.length;

  return (
    <Layout title="CSV ↔ JSON Converter">
      <div className={styles.container}>
        {/* Mode Selector */}
        <div className={styles.modeBar}>
          <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={handleModeChange} />
        </div>

        {/* Options */}
        <div className={styles.optionsBar}>
          <div className={styles.optionsLeft}>
            <div className={styles.optionGroup}>
              <span className={styles.optionLabel}>Delimiter</span>
              <select
                className={styles.select}
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value as Delimiter | 'auto')}
              >
                {DELIMITER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {mode === 'csv-to-json' && (
              <>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={firstRowHeaders} onChange={(e) => setFirstRowHeaders(e.target.checked)} />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Headers</span>
                </label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Trim</span>
                </label>
                <label className={styles.toggle}>
                  <input type="checkbox" checked={skipEmptyRows} onChange={(e) => setSkipEmptyRows(e.target.checked)} />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Skip empty</span>
                </label>
              </>
            )}

            {mode === 'csv-to-json' && (
              <div className={styles.optionGroup}>
                <span className={styles.optionLabel}>Format</span>
                <select
                  className={styles.select}
                  value={jsonIndent}
                  onChange={(e) => setJsonIndent(e.target.value as JsonIndent)}
                >
                  {INDENT_OPTIONS.map(o => (
                    <option key={o.label} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className={styles.optionsRight}>
            <Button variant="secondary" onClick={handleLoadSample}>Sample</Button>
            <Button variant="secondary" onClick={handleClear}>Clear</Button>
          </div>
        </div>

        {/* Panels */}
        <div className={styles.panels}>
          {/* Input Panel */}
          <div className={`${styles.panel} ${styles.inputPanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {mode === 'csv-to-json' ? 'CSV Input' : 'JSON Input'}
              </span>
              <span className={styles.charCount}>{input.length.toLocaleString()} chars</span>
            </div>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'csv-to-json'
                  ? 'Paste CSV data here...'
                  : 'Paste JSON array of objects here...'
              }
              spellCheck={false}
            />
          </div>

          {/* Output Panel */}
          <div className={`${styles.panel} ${styles.outputPanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {mode === 'csv-to-json' ? 'JSON Output' : 'CSV Output'}
              </span>
              <div className={styles.panelHeaderRight}>
                <span className={styles.charCount}>{result.output.length.toLocaleString()} chars</span>
                <button
                  className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                  onClick={handleCopy}
                  disabled={!result.output}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className={styles.outputArea}>
              {error ? (
                <span className={styles.errorText}>{error}</span>
              ) : result.output ? (
                result.output
              ) : (
                <span className={styles.placeholder}>
                  {mode === 'csv-to-json' ? 'JSON output will appear here...' : 'CSV output will appear here...'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats & Actions */}
        {result.output && !error && (
          <div className={styles.statsBar}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{rowCount}</span>
                <span className={styles.statLabel}>{rowCount === 1 ? 'Row' : 'Rows'}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{colCount}</span>
                <span className={styles.statLabel}>{colCount === 1 ? 'Column' : 'Columns'}</span>
              </div>
              {mode === 'csv-to-json' && delimiter === 'auto' && (
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {result.detectedDelimiter === '\t' ? 'Tab' : result.detectedDelimiter === ',' ? 'Comma' : result.detectedDelimiter === ';' ? 'Semi' : 'Pipe'}
                  </span>
                  <span className={styles.statLabel}>Delimiter</span>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setShowTable(t => !t)}>
                {showTable ? 'Hide Table' : 'Show Table'}
              </Button>
              <Button variant="primary" onClick={handleDownload}>
                Download .{mode === 'csv-to-json' ? 'json' : 'csv'}
              </Button>
            </div>
          </div>
        )}

        {/* Table Preview */}
        {result.output && !error && showTable && result.headers.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rowNum}>#</th>
                  {result.headers.map((header, i) => (
                    <th
                      key={i}
                      className={styles.th}
                      onClick={() => handleSort(i)}
                    >
                      <span className={styles.thContent}>
                        {header}
                        <span className={styles.sortArrow}>
                          {sortCol === i ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? styles.trAlt : undefined}>
                    <td className={styles.rowNum}>{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci} className={styles.td}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
