import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type InputMode = 'text' | 'file';

const INPUT_OPTIONS = [
  { label: 'Text', value: 'text' },
  { label: 'File', value: 'file' },
];

const LS_KEY = 'hash-gen-state';

const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'CRC32'] as const;
const HMAC_ALGORITHMS = ['HMAC-SHA-1', 'HMAC-SHA-256', 'HMAC-SHA-512'] as const;
type Algorithm = (typeof ALGORITHMS)[number];
type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

// ── CRC32 Implementation ──
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

// ── MD5 Implementation ──
function md5(data: Uint8Array): string {
  // Pre-processing
  const bitLen = data.length * 8;
  const padLen = ((data.length + 8) >>> 6) + 1;
  const buf = new Uint8Array(padLen * 64);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen * 64 - 8, bitLen & 0xffffffff, true);
  view.setUint32(padLen * 64 - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(0x100000000 * Math.abs(Math.sin(i + 1)));
  }

  for (let chunk = 0; chunk < padLen; chunk++) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(chunk * 64 + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const result = new DataView(new ArrayBuffer(16));
  result.setUint32(0, a0, true);
  result.setUint32(4, b0, true);
  result.setUint32(8, c0, true);
  result.setUint32(12, d0, true);

  return Array.from(new Uint8Array(result.buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── SHA via Web Crypto ──
async function sha(algorithm: string, data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(algorithm, data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── HMAC via Web Crypto ──
async function hmac(algorithm: string, data: Uint8Array, secret: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret.buffer as ArrayBuffer,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type HashResults = Record<string, string>;

async function computeAllHashes(
  data: Uint8Array,
  secretKey: string,
  hmacEnabled: boolean
): Promise<HashResults> {
  const results: HashResults = {};

  const [sha1, sha256, sha512] = await Promise.all([
    sha('SHA-1', data),
    sha('SHA-256', data),
    sha('SHA-512', data),
  ]);

  results['MD5'] = md5(data);
  results['SHA-1'] = sha1;
  results['SHA-256'] = sha256;
  results['SHA-512'] = sha512;
  results['CRC32'] = crc32(data);

  if (hmacEnabled && secretKey) {
    const keyData = new TextEncoder().encode(secretKey);
    const [hmacSha1, hmacSha256, hmacSha512] = await Promise.all([
      hmac('SHA-1', data, keyData),
      hmac('SHA-256', data, keyData),
      hmac('SHA-512', data, keyData),
    ]);
    results['HMAC-SHA-1'] = hmacSha1;
    results['HMAC-SHA-256'] = hmacSha256;
    results['HMAC-SHA-512'] = hmacSha512;
  }

  return results;
}

function loadState(): { input: string; uppercase: boolean; hmacEnabled: boolean; secretKey: string } {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        input: parsed.input || '',
        uppercase: parsed.uppercase || false,
        hmacEnabled: parsed.hmacEnabled || false,
        secretKey: parsed.secretKey || '',
      };
    }
  } catch { /* ignore */ }
  return { input: '', uppercase: false, hmacEnabled: false, secretKey: '' };
}

function saveState(input: string, uppercase: boolean, hmacEnabled: boolean, secretKey: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ input, uppercase, hmacEnabled, secretKey }));
  } catch { /* ignore */ }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const saved = useMemo(loadState, []);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [input, setInput] = useState(saved.input);
  const [uppercase, setUppercase] = useState(saved.uppercase);
  const [hmacEnabled, setHmacEnabled] = useState(saved.hmacEnabled);
  const [secretKey, setSecretKey] = useState(saved.secretKey);
  const [hashes, setHashes] = useState<HashResults>({});
  const [compareHash, setCompareHash] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [computing, setComputing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const copyAllTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Compute hashes for text input
  useEffect(() => {
    if (inputMode !== 'text') return;
    if (!input) {
      setHashes({});
      return;
    }
    const data = new TextEncoder().encode(input);
    let cancelled = false;
    setComputing(true);
    computeAllHashes(data, secretKey, hmacEnabled).then((results) => {
      if (!cancelled) {
        setHashes(results);
        setComputing(false);
      }
    });
    saveState(input, uppercase, hmacEnabled, secretKey);
    return () => { cancelled = true; };
  }, [input, secretKey, hmacEnabled, inputMode, uppercase]);

  const handleInputModeChange = useCallback((value: string) => {
    setInputMode(value as InputMode);
    setInput('');
    setHashes({});
    setFileName('');
    setFileSize(0);
    setCompareHash('');
  }, []);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setFileSize(file.size);
    setComputing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      computeAllHashes(data, secretKey, hmacEnabled).then((results) => {
        setHashes(results);
        setComputing(false);
      });
      trackEvent('hash_file_compute', { size: String(file.size) });
    };
    reader.readAsArrayBuffer(file);
  }, [secretKey, hmacEnabled]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      const text = uppercase ? value.toUpperCase() : value;
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
      trackEvent('hash_copy', { algorithm: key });
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, [uppercase]);

  const handleCopyAll = useCallback(async () => {
    const allAlgos = [...ALGORITHMS, ...(hmacEnabled ? HMAC_ALGORITHMS : [])];
    const lines = allAlgos
      .filter((algo) => hashes[algo])
      .map((algo) => {
        const val = uppercase ? hashes[algo].toUpperCase() : hashes[algo];
        return `${algo}: ${val}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopiedAll(true);
      if (copyAllTimeoutRef.current) clearTimeout(copyAllTimeoutRef.current);
      copyAllTimeoutRef.current = setTimeout(() => setCopiedAll(false), 2000);
      trackEvent('hash_copy_all');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, [hashes, uppercase, hmacEnabled]);

  const handleClear = useCallback(() => {
    setInput('');
    setHashes({});
    setFileName('');
    setFileSize(0);
    setCompareHash('');
    saveState('', uppercase, hmacEnabled, secretKey);
  }, [uppercase, hmacEnabled, secretKey]);

  const compareNormalized = compareHash.trim().toLowerCase();
  const hasResults = Object.keys(hashes).length > 0;
  const allAlgos = [...ALGORITHMS, ...(hmacEnabled ? HMAC_ALGORITHMS : [])] as string[];

  return (
    <Layout title="Hash Generator">
      <div className={styles.container}>
        {/* Mode & Options */}
        <div className={styles.modeBar}>
          <SegmentedControl
            options={INPUT_OPTIONS}
            value={inputMode}
            onChange={handleInputModeChange}
          />
        </div>

        {/* Options */}
        <div className={styles.optionsBar}>
          <div className={styles.optionsLeft}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={uppercase}
                onChange={(e) => {
                  setUppercase(e.target.checked);
                  saveState(input, e.target.checked, hmacEnabled, secretKey);
                }}
              />
              <span className={styles.toggleSlider} />
              <span className={styles.toggleLabel}>Uppercase</span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={hmacEnabled}
                onChange={(e) => {
                  setHmacEnabled(e.target.checked);
                  saveState(input, uppercase, e.target.checked, secretKey);
                }}
              />
              <span className={styles.toggleSlider} />
              <span className={styles.toggleLabel}>HMAC</span>
            </label>
          </div>
          <Button variant="secondary" onClick={handleClear}>
            Clear
          </Button>
        </div>

        {/* HMAC Secret Key */}
        {hmacEnabled && (
          <div className={styles.secretKeyBar}>
            <label className={styles.secretKeyLabel}>Secret Key</label>
            <input
              className={styles.secretKeyInput}
              type="text"
              value={secretKey}
              onChange={(e) => {
                setSecretKey(e.target.value);
                saveState(input, uppercase, hmacEnabled, e.target.value);
              }}
              placeholder="Enter HMAC secret key..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Input Area */}
        <div className={styles.inputPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Input</span>
            {inputMode === 'text' && (
              <span className={styles.charCount}>{input.length.toLocaleString()} chars</span>
            )}
            {inputMode === 'file' && fileName && (
              <span className={styles.charCount}>{formatBytes(fileSize)}</span>
            )}
          </div>
          {inputMode === 'text' ? (
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter text to hash..."
              spellCheck={false}
            />
          ) : (
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className={styles.fileInput}
                onChange={handleFileSelect}
              />
              {fileName ? (
                <div className={styles.fileInfo}>
                  <span className={styles.fileIcon}>&#128196;</span>
                  <div className={styles.fileDetails}>
                    <span className={styles.fileName}>{fileName}</span>
                    <span className={styles.fileSizeLabel}>{formatBytes(fileSize)}</span>
                  </div>
                </div>
              ) : (
                <div className={styles.dropContent}>
                  <span className={styles.dropIcon}>&#128193;</span>
                  <span className={styles.dropText}>Drop a file here or click to browse</span>
                  <span className={styles.dropHint}>Any file type supported</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hash Comparison */}
        <div className={styles.compareBar}>
          <label className={styles.compareLabel}>Compare Hash</label>
          <input
            className={styles.compareInput}
            type="text"
            value={compareHash}
            onChange={(e) => setCompareHash(e.target.value)}
            placeholder="Paste an expected hash to compare..."
            spellCheck={false}
          />
        </div>

        {/* Computing indicator */}
        {computing && (
          <div className={styles.computing}>Computing hashes...</div>
        )}

        {/* Hash Results */}
        {hasResults && (
          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              <span className={styles.resultsTitle}>Hash Results</span>
              <button
                className={`${styles.copyAllBtn} ${copiedAll ? styles.copyAllBtnSuccess : ''}`}
                onClick={handleCopyAll}
              >
                {copiedAll ? 'Copied All!' : 'Copy All'}
              </button>
            </div>
            <div className={styles.hashList}>
              {allAlgos.map((algo) => {
                const value = hashes[algo];
                if (!value) return null;
                const displayValue = uppercase ? value.toUpperCase() : value;
                const isMatch = compareNormalized && compareNormalized === value.toLowerCase();
                const isMismatch = compareNormalized && compareNormalized !== value.toLowerCase();
                const showCompare = !!compareNormalized;

                return (
                  <div
                    key={algo}
                    className={`${styles.hashRow} ${showCompare ? (isMatch ? styles.hashMatch : styles.hashMismatch) : ''}`}
                    onClick={() => handleCopy(algo, value)}
                  >
                    <div className={styles.hashHeader}>
                      <span className={styles.hashAlgo}>{algo}</span>
                      <div className={styles.hashActions}>
                        {showCompare && (
                          <span className={isMatch ? styles.matchBadge : styles.mismatchBadge}>
                            {isMatch ? 'Match' : 'No match'}
                          </span>
                        )}
                        <span className={styles.copyHint}>
                          {copiedKey === algo ? 'Copied!' : 'Click to copy'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.hashValue}>{displayValue}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.footer}>
          All hashes computed locally in your browser
        </div>
      </div>
    </Layout>
  );
}
