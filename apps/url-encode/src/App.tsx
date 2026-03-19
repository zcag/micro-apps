import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type Tab = 'encode' | 'url-parse' | 'query-builder';
type EncodeMode = 'component' | 'uri' | 'percent' | 'base64url';

const TAB_OPTIONS = [
  { label: 'Encode / Decode', value: 'encode' as Tab },
  { label: 'URL Parser', value: 'url-parse' as Tab },
  { label: 'Query Builder', value: 'query-builder' as Tab },
];

const ENCODE_MODE_OPTIONS = [
  { label: 'encodeURIComponent', value: 'component' as EncodeMode },
  { label: 'encodeURI', value: 'uri' as EncodeMode },
  { label: 'Percent-Encode', value: 'percent' as EncodeMode },
  { label: 'Base64 URL', value: 'base64url' as EncodeMode },
];

const LS_KEY = 'url-encode-state';

interface QueryParam {
  id: string;
  key: string;
  value: string;
}

interface ParsedURL {
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  params: [string, string][];
}

// ── Encoding functions ──

function encodeWithMode(text: string, mode: EncodeMode): string {
  try {
    switch (mode) {
      case 'component':
        return encodeURIComponent(text);
      case 'uri':
        return encodeURI(text);
      case 'percent':
        return fullPercentEncode(text);
      case 'base64url':
        return base64UrlEncode(text);
    }
  } catch {
    return '// Error: Could not encode input';
  }
}

function decodeAny(text: string): string {
  try {
    // Try base64url first if it looks like it
    if (/^[A-Za-z0-9_-]+$/.test(text.trim()) && text.trim().length > 3) {
      try {
        const decoded = base64UrlDecode(text.trim());
        // Only use base64 decode if result is printable
        if (/^[\x20-\x7E\t\n\r]+$/.test(decoded)) {
          return decoded;
        }
      } catch { /* not base64url */ }
    }
    return decodeURIComponent(text);
  } catch {
    try {
      return unescape(text);
    } catch {
      return '// Error: Could not decode input';
    }
  }
}

function fullPercentEncode(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return Array.from(bytes)
    .map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
}

function base64UrlEncode(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  const binary = Array.from(utf8, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded: string): string {
  let input = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4 !== 0) input += '=';
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isDoubleEncoded(text: string): boolean {
  if (!text.includes('%')) return false;
  try {
    const decoded = decodeURIComponent(text);
    return decoded.includes('%') && decoded !== text;
  } catch {
    return false;
  }
}

function parseURL(url: string): ParsedURL | null {
  try {
    const u = new URL(url);
    const params: [string, string][] = [];
    u.searchParams.forEach((v, k) => params.push([k, v]));
    return {
      protocol: u.protocol,
      host: u.host,
      hostname: u.hostname,
      port: u.port,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      params,
    };
  } catch {
    return null;
  }
}

function getEncodedSegments(text: string): { start: number; end: number; decoded: string }[] {
  const segments: { start: number; end: number; decoded: string }[] = [];
  const regex = /(%[0-9A-Fa-f]{2})+/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        decoded: decodeURIComponent(match[0]),
      });
    } catch { /* skip */ }
  }
  return segments;
}

function loadState() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { input: parsed.input || '', encodeMode: parsed.encodeMode || 'component' };
    }
  } catch { /* ignore */ }
  return { input: '', encodeMode: 'component' };
}

function saveState(input: string, encodeMode: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ input, encodeMode }));
  } catch { /* ignore */ }
}

let idCounter = 0;
function newId(): string {
  return String(++idCounter);
}

export default function App() {
  const saved = useMemo(loadState, []);
  const [tab, setTab] = useState<Tab>('encode');
  const [input, setInput] = useState(saved.input);
  const [encodeMode, setEncodeMode] = useState<EncodeMode>(saved.encodeMode as EncodeMode);
  const [isDecoding, setIsDecoding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<{ decoded: string; x: number; y: number } | null>(null);

  // URL Parser state
  const [urlInput, setUrlInput] = useState('');

  // Query Builder state
  const [queryParams, setQueryParams] = useState<QueryParam[]>([
    { id: newId(), key: '', value: '' },
  ]);
  const [queryInput, setQueryInput] = useState('');
  const [queryTab, setQueryTab] = useState<'build' | 'parse'>('build');

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Compute output ──
  const output = useMemo(() => {
    if (!input.trim()) return '';
    if (isDecoding) {
      return decodeAny(input);
    }
    return encodeWithMode(input, encodeMode);
  }, [input, encodeMode, isDecoding]);

  const doubleEncoded = useMemo(() => isDoubleEncoded(input), [input]);

  const encodedSegments = useMemo(() => getEncodedSegments(output), [output]);

  // URL parse result
  const parsedUrl = useMemo(() => {
    if (!urlInput.trim()) return null;
    return parseURL(urlInput);
  }, [urlInput]);

  // Query builder output
  const builtQuery = useMemo(() => {
    const validParams = queryParams.filter((p) => p.key.trim());
    if (validParams.length === 0) return '';
    const searchParams = new URLSearchParams();
    validParams.forEach((p) => searchParams.append(p.key, p.value));
    return searchParams.toString();
  }, [queryParams]);

  // Query parser result
  const parsedQuery = useMemo(() => {
    if (!queryInput.trim()) return [];
    try {
      let qs = queryInput.trim();
      if (qs.startsWith('?')) qs = qs.slice(1);
      const params = new URLSearchParams(qs);
      const result: [string, string][] = [];
      params.forEach((v, k) => result.push([k, v]));
      return result;
    } catch {
      return [];
    }
  }, [queryInput]);

  // Persist
  useEffect(() => {
    saveState(input, encodeMode);
  }, [input, encodeMode]);

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      trackEvent('url_encode_copy');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, []);

  const handleSwap = useCallback(() => {
    if (!output) return;
    setInput(output);
    setIsDecoding(!isDecoding);
    trackEvent('url_encode_swap');
  }, [output, isDecoding]);

  const handleClear = useCallback(() => {
    setInput('');
  }, []);

  const addQueryParam = useCallback(() => {
    setQueryParams((prev) => [...prev, { id: newId(), key: '', value: '' }]);
  }, []);

  const removeQueryParam = useCallback((id: string) => {
    setQueryParams((prev) => prev.length > 1 ? prev.filter((p) => p.id !== id) : prev);
  }, []);

  const updateQueryParam = useCallback((id: string, field: 'key' | 'value', val: string) => {
    setQueryParams((prev) => prev.map((p) => p.id === id ? { ...p, [field]: val } : p));
  }, []);

  // Render encoded output with highlighting
  const renderHighlightedOutput = useCallback(() => {
    if (!output) return <span className={styles.placeholder}>Output will appear here...</span>;
    if (encodedSegments.length === 0) return output;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    encodedSegments.forEach((seg, i) => {
      if (seg.start > lastIndex) {
        parts.push(<span key={`t${i}`}>{output.slice(lastIndex, seg.start)}</span>);
      }
      parts.push(
        <span
          key={`e${i}`}
          className={styles.encodedChar}
          onMouseEnter={(e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            setHoveredSegment({ decoded: seg.decoded, x: rect.left, y: rect.top - 36 });
          }}
          onMouseLeave={() => setHoveredSegment(null)}
        >
          {output.slice(seg.start, seg.end)}
        </span>
      );
      lastIndex = seg.end;
    });

    if (lastIndex < output.length) {
      parts.push(<span key="tail">{output.slice(lastIndex)}</span>);
    }

    return parts;
  }, [output, encodedSegments]);

  return (
    <Layout title="URL Encoder/Decoder">
      <div className={styles.container}>
        {/* Tab Bar */}
        <div className={styles.tabBar}>
          <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={(v) => { setTab(v); trackEvent('url_encode_tab', { tab: v }); }} />
        </div>

        {/* ── Encode / Decode Tab ── */}
        {tab === 'encode' && (
          <>
            {/* Mode Bar */}
            <div className={styles.modeBar}>
              <div className={styles.modeLeft}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={isDecoding}
                    onChange={(e) => { setIsDecoding(e.target.checked); trackEvent('url_encode_direction', { decode: String(e.target.checked) }); }}
                  />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>{isDecoding ? 'Decode' : 'Encode'}</span>
                </label>
              </div>
              {!isDecoding && (
                <div className={styles.encodeModeSelect}>
                  <SegmentedControl
                    options={ENCODE_MODE_OPTIONS}
                    value={encodeMode}
                    onChange={(v) => { setEncodeMode(v); trackEvent('url_encode_mode', { mode: v }); }}
                  />
                </div>
              )}
              <div className={styles.modeRight}>
                <Button variant="secondary" onClick={handleClear}>Clear</Button>
              </div>
            </div>

            {/* Double encoding warning */}
            {doubleEncoded && (
              <div className={styles.warning}>
                Input appears to be already encoded. You may be double-encoding.
              </div>
            )}

            {/* Panels */}
            <div className={styles.panels}>
              {/* Input Panel */}
              <div className={`${styles.panel} ${styles.inputPanel}`}>
                <div className={styles.panelHeader}>
                  <span className={styles.panelTitle}>Input</span>
                  <span className={styles.charCount}>{input.length.toLocaleString()} chars</span>
                </div>
                <textarea
                  className={styles.textarea}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isDecoding ? 'Paste encoded string to decode...' : 'Enter text to encode...'}
                  spellCheck={false}
                />
              </div>

              {/* Swap Button */}
              <div className={styles.swapContainer}>
                <button
                  className={styles.swapBtn}
                  onClick={handleSwap}
                  disabled={!output}
                  title="Swap input and output"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* Output Panel */}
              <div className={`${styles.panel} ${styles.outputPanel}`}>
                <div className={styles.panelHeader}>
                  <span className={styles.panelTitle}>Output</span>
                  <div className={styles.panelHeaderRight}>
                    <span className={styles.charCount}>{output.length.toLocaleString()} chars</span>
                    <button
                      className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                      onClick={() => handleCopy(output)}
                      disabled={!output}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className={styles.outputArea}>
                  {renderHighlightedOutput()}
                </div>
              </div>
            </div>

            {/* Tooltip for character inspector */}
            {hoveredSegment && (
              <div
                className={styles.tooltip}
                style={{ left: hoveredSegment.x, top: hoveredSegment.y }}
              >
                {hoveredSegment.decoded}
              </div>
            )}
          </>
        )}

        {/* ── URL Parser Tab ── */}
        {tab === 'url-parse' && (
          <div className={styles.parserSection}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>URL Input</span>
              </div>
              <textarea
                className={styles.textarea}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste a full URL to break it into components... e.g. https://example.com/path?key=value#section"
                spellCheck={false}
                rows={2}
                style={{ minHeight: 60 }}
              />
            </div>

            {parsedUrl && (
              <Card>
                <div className={styles.urlComponents}>
                  <h3 className={styles.sectionTitle}>URL Components</h3>
                  <table className={styles.table}>
                    <tbody>
                      <tr>
                        <td className={styles.tableLabel}>Protocol</td>
                        <td className={styles.tableValue}>{parsedUrl.protocol}</td>
                      </tr>
                      <tr>
                        <td className={styles.tableLabel}>Host</td>
                        <td className={styles.tableValue}>{parsedUrl.host}</td>
                      </tr>
                      {parsedUrl.port && (
                        <tr>
                          <td className={styles.tableLabel}>Port</td>
                          <td className={styles.tableValue}>{parsedUrl.port}</td>
                        </tr>
                      )}
                      <tr>
                        <td className={styles.tableLabel}>Path</td>
                        <td className={styles.tableValue}>{parsedUrl.pathname}</td>
                      </tr>
                      {parsedUrl.search && (
                        <tr>
                          <td className={styles.tableLabel}>Query</td>
                          <td className={styles.tableValue}>{parsedUrl.search}</td>
                        </tr>
                      )}
                      {parsedUrl.hash && (
                        <tr>
                          <td className={styles.tableLabel}>Fragment</td>
                          <td className={styles.tableValue}>{parsedUrl.hash}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {parsedUrl.params.length > 0 && (
                    <>
                      <h3 className={styles.sectionTitle}>Query Parameters</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.tableLabel}>Key</th>
                            <th className={styles.tableLabel}>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedUrl.params.map(([k, v], i) => (
                            <tr key={i}>
                              <td className={styles.tableValue}>{k}</td>
                              <td className={styles.tableValue}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              </Card>
            )}

            {urlInput.trim() && !parsedUrl && (
              <div className={styles.warning}>
                Invalid URL. Please enter a valid URL including the protocol (e.g. https://).
              </div>
            )}
          </div>
        )}

        {/* ── Query Builder Tab ── */}
        {tab === 'query-builder' && (
          <div className={styles.querySection}>
            <div className={styles.queryTabs}>
              <SegmentedControl
                options={[
                  { label: 'Build', value: 'build' as const },
                  { label: 'Parse', value: 'parse' as const },
                ]}
                value={queryTab}
                onChange={setQueryTab}
              />
            </div>

            {queryTab === 'build' && (
              <>
                <Card>
                  <div className={styles.queryBuilder}>
                    <h3 className={styles.sectionTitle}>Query String Builder</h3>
                    <div className={styles.paramList}>
                      {queryParams.map((param) => (
                        <div key={param.id} className={styles.paramRow}>
                          <input
                            className={styles.paramInput}
                            value={param.key}
                            onChange={(e) => updateQueryParam(param.id, 'key', e.target.value)}
                            placeholder="Key"
                          />
                          <span className={styles.paramEquals}>=</span>
                          <input
                            className={styles.paramInput}
                            value={param.value}
                            onChange={(e) => updateQueryParam(param.id, 'value', e.target.value)}
                            placeholder="Value"
                          />
                          <button
                            className={styles.removeBtn}
                            onClick={() => removeQueryParam(param.id)}
                            title="Remove parameter"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="secondary" onClick={addQueryParam}>
                      + Add Parameter
                    </Button>
                  </div>
                </Card>

                {builtQuery && (
                  <div className={`${styles.panel} ${styles.outputPanel}`}>
                    <div className={styles.panelHeader}>
                      <span className={styles.panelTitle}>Generated Query String</span>
                      <button
                        className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                        onClick={() => handleCopy(builtQuery)}
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className={styles.outputArea}>
                      <span className={styles.queryPrefix}>?</span>{builtQuery}
                    </div>
                  </div>
                )}
              </>
            )}

            {queryTab === 'parse' && (
              <>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <span className={styles.panelTitle}>Query String Input</span>
                  </div>
                  <textarea
                    className={styles.textarea}
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="Paste a query string... e.g. ?name=John&age=30&city=New%20York"
                    spellCheck={false}
                    rows={2}
                    style={{ minHeight: 60 }}
                  />
                </div>

                {parsedQuery.length > 0 && (
                  <Card>
                    <h3 className={styles.sectionTitle}>Decoded Parameters</h3>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.tableLabel}>Key</th>
                          <th className={styles.tableLabel}>Decoded Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedQuery.map(([k, v], i) => (
                          <tr key={i}>
                            <td className={styles.tableValue}>{k}</td>
                            <td className={styles.tableValue}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
