import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type Mode = 'encode' | 'decode';
type InputMode = 'text' | 'file';

const MODE_OPTIONS = [
  { label: 'Encode', value: 'encode' },
  { label: 'Decode', value: 'decode' },
];

const INPUT_OPTIONS = [
  { label: 'Text', value: 'text' },
  { label: 'File', value: 'file' },
];

const LS_KEY = 'base64-tool-state';

function isValidBase64(str: string): boolean {
  if (!str || str.length < 4) return false;
  const trimmed = str.trim();
  // Standard or URL-safe base64
  return /^[A-Za-z0-9+/\-_=\s]+$/.test(trimmed) && trimmed.length % 4 <= 2;
}

function encodeBase64(text: string, urlSafe: boolean): string {
  try {
    // Handle Unicode by encoding to UTF-8 first
    const utf8 = new TextEncoder().encode(text);
    const binary = Array.from(utf8, (b) => String.fromCharCode(b)).join('');
    let result = btoa(binary);
    if (urlSafe) {
      result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return result;
  } catch {
    return '// Error: Could not encode input';
  }
}

function decodeBase64(encoded: string, urlSafe: boolean): string {
  try {
    let input = encoded.trim();
    if (urlSafe) {
      input = input.replace(/-/g, '+').replace(/_/g, '/');
      // Restore padding
      while (input.length % 4 !== 0) input += '=';
    }
    const binary = atob(input);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '// Error: Invalid Base64 input';
  }
}

function loadState(): { input: string; mode: Mode; urlSafe: boolean } {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        input: parsed.input || '',
        mode: parsed.mode || 'encode',
        urlSafe: parsed.urlSafe || false,
      };
    }
  } catch { /* ignore */ }
  return { input: '', mode: 'encode', urlSafe: false };
}

function saveState(input: string, mode: Mode, urlSafe: boolean) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ input, mode, urlSafe }));
  } catch { /* ignore */ }
}

export default function App() {
  const saved = useMemo(loadState, []);
  const [mode, setMode] = useState<Mode>(saved.mode);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [input, setInput] = useState(saved.input);
  const [output, setOutput] = useState('');
  const [urlSafe, setUrlSafe] = useState(saved.urlSafe);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Process text input
  useEffect(() => {
    if (inputMode !== 'text') return;
    if (!input.trim()) {
      setOutput('');
      setAutoDetected(false);
      return;
    }
    const result = mode === 'encode' ? encodeBase64(input, urlSafe) : decodeBase64(input, urlSafe);
    setOutput(result);
    saveState(input, mode, urlSafe);

    // Auto-detect
    if (mode === 'encode' && isValidBase64(input)) {
      setAutoDetected(true);
    } else {
      setAutoDetected(false);
    }
  }, [input, mode, urlSafe, inputMode]);

  const handleModeChange = useCallback((value: string) => {
    setMode(value as Mode);
    setInput('');
    setOutput('');
    setFileName('');
    setInputMode('text');
    trackEvent('base64_mode_change', { mode: value });
  }, []);

  const handleInputModeChange = useCallback((value: string) => {
    setInputMode(value as InputMode);
    setInput('');
    setOutput('');
    setFileName('');
  }, []);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      trackEvent('base64_copy');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch { /* ignore */ }
  }, [output]);

  const handleClear = useCallback(() => {
    setInput('');
    setOutput('');
    setFileName('');
    setAutoDetected(false);
    saveState('', mode, urlSafe);
  }, [mode, urlSafe]);

  const handleSwitchToDetected = useCallback(() => {
    setMode('decode');
    setAutoDetected(false);
  }, []);

  // File handling
  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    if (mode === 'encode') {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // dataURL is "data:mime;base64,XXXX" — extract the base64 part
        const base64 = result.split(',')[1] || '';
        setOutput(urlSafe ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base64);
        setInput(`[File: ${file.name} — ${formatBytes(file.size)}]`);
        trackEvent('base64_file_encode', { size: String(file.size) });
      };
      reader.readAsDataURL(file);
    }
  }, [mode, urlSafe]);

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

  const handleDownloadDecoded = useCallback(() => {
    if (!input.trim() || mode !== 'decode') return;
    try {
      let b64 = input.trim();
      if (urlSafe) {
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) b64 += '=';
      }
      const binary = atob(b64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'decoded-file';
      a.click();
      URL.revokeObjectURL(url);
      trackEvent('base64_file_download');
    } catch { /* ignore */ }
  }, [input, mode, urlSafe]);

  const inputCount = input.length;
  const outputCount = output.length;

  return (
    <Layout title="Base64 Encoder/Decoder">
      <div className={styles.container}>
        {/* Mode Selectors */}
        <div className={styles.modeBar}>
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={handleModeChange}
          />
          <SegmentedControl
            options={INPUT_OPTIONS}
            value={inputMode}
            onChange={handleInputModeChange}
          />
        </div>

        {/* Options Bar */}
        <div className={styles.optionsBar}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={urlSafe}
              onChange={(e) => setUrlSafe(e.target.checked)}
            />
            <span className={styles.toggleSlider} />
            <span className={styles.toggleLabel}>URL-safe</span>
          </label>
          <div className={styles.optionsRight}>
            {mode === 'decode' && inputMode === 'text' && input.trim() && (
              <Button variant="secondary" onClick={handleDownloadDecoded}>
                Download as File
              </Button>
            )}
            <Button variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>

        {/* Auto-detect banner */}
        {autoDetected && (
          <div className={styles.autoDetect} onClick={handleSwitchToDetected}>
            Input looks like Base64 — switch to Decode?
          </div>
        )}

        {/* Panels */}
        <div className={styles.panels}>
          {/* Input Panel */}
          <div className={`${styles.panel} ${styles.inputPanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {mode === 'encode' ? 'Plain Text' : 'Base64 Input'}
              </span>
              <span className={styles.charCount}>{inputCount.toLocaleString()} chars</span>
            </div>
            {inputMode === 'text' ? (
              <textarea
                className={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === 'encode'
                    ? 'Enter text to encode...'
                    : 'Paste Base64 string to decode...'
                }
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
                    <span className={styles.fileName}>{fileName}</span>
                  </div>
                ) : (
                  <div className={styles.dropContent}>
                    <span className={styles.dropIcon}>&#128193;</span>
                    <span className={styles.dropText}>
                      Drop a file here or click to browse
                    </span>
                    <span className={styles.dropHint}>
                      Any file type supported
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Output Panel */}
          <div className={`${styles.panel} ${styles.outputPanel}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {mode === 'encode' ? 'Base64 Output' : 'Decoded Text'}
              </span>
              <div className={styles.panelHeaderRight}>
                <span className={styles.charCount}>{outputCount.toLocaleString()} chars</span>
                <button
                  className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ''}`}
                  onClick={handleCopy}
                  disabled={!output}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className={styles.outputArea}>
              {output || (
                <span className={styles.placeholder}>
                  {mode === 'encode' ? 'Encoded output will appear here...' : 'Decoded output will appear here...'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
