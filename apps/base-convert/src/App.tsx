import { useState, useCallback, useEffect, useMemo } from 'react';
import { Layout, Card, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BitWidth = 8 | 16 | 32 | 64;
type BitwiseOp = 'AND' | 'OR' | 'XOR' | 'NOT' | 'SHL' | 'SHR';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'base-convert-state';
const BIT_WIDTHS: BitWidth[] = [8, 16, 32, 64];
const BITWISE_OPS: { label: string; value: BitwiseOp }[] = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' },
  { label: 'XOR', value: 'XOR' },
  { label: 'NOT', value: 'NOT' },
  { label: '<< SHL', value: 'SHL' },
  { label: '>> SHR', value: 'SHR' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadState(): { input: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { input: '42' };
}

function saveState(input: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ input }));
}

function detectBase(input: string): { value: bigint; base: number } | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  try {
    if (s.startsWith('0b')) {
      const digits = s.slice(2);
      if (/^[01]+$/.test(digits)) return { value: BigInt('0b' + digits), base: 2 };
    }
    if (s.startsWith('0o')) {
      const digits = s.slice(2);
      if (/^[0-7]+$/.test(digits)) return { value: BigInt('0o' + digits), base: 8 };
    }
    if (s.startsWith('0x')) {
      const digits = s.slice(2);
      if (/^[0-9a-f]+$/.test(digits)) return { value: BigInt('0x' + digits), base: 16 };
    }

    // Try decimal
    if (/^-?[0-9]+$/.test(s)) {
      return { value: BigInt(s), base: 10 };
    }
  } catch { /* ignore */ }
  return null;
}

function bigintToBase(value: bigint, base: number): string {
  if (base < 2 || base > 36) return '';
  if (value === 0n) return '0';

  const negative = value < 0n;
  let v = negative ? -value : value;
  const digits: string[] = [];
  const charset = '0123456789abcdefghijklmnopqrstuvwxyz';
  const b = BigInt(base);

  while (v > 0n) {
    digits.push(charset[Number(v % b)]);
    v = v / b;
  }

  return (negative ? '-' : '') + digits.reverse().join('');
}

function parseFromBase(input: string, base: number): bigint | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const negative = s.startsWith('-');
  const digits = negative ? s.slice(1) : s;
  if (!digits) return null;

  const charset = '0123456789abcdefghijklmnopqrstuvwxyz';
  const b = BigInt(base);
  let result = 0n;

  for (const ch of digits) {
    const idx = charset.indexOf(ch);
    if (idx < 0 || idx >= base) return null;
    result = result * b + BigInt(idx);
  }

  return negative ? -result : result;
}

function groupDigits(str: string, groupSize: number, separator: string): string {
  const negative = str.startsWith('-');
  const digits = negative ? str.slice(1) : str;

  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= groupSize) {
    const start = Math.max(0, i - groupSize);
    groups.unshift(digits.slice(start, i));
  }

  return (negative ? '-' : '') + groups.join(separator);
}

function formatForBase(str: string, base: number): string {
  if (base === 2) return groupDigits(str, 4, ' ');
  if (base === 16) return groupDigits(str, 2, ':').toUpperCase();
  if (base === 10) return groupDigits(str, 3, ',');
  if (base === 8) return groupDigits(str, 3, ' ');
  return str;
}

function maskToWidth(value: bigint, bitWidth: BitWidth, signed: boolean): bigint {
  const mask = (1n << BigInt(bitWidth)) - 1n;
  let v = value & mask;
  if (signed && v >= (1n << BigInt(bitWidth - 1))) {
    v = v - (1n << BigInt(bitWidth));
  }
  return v;
}

function toUnsigned(value: bigint, bitWidth: BitWidth): bigint {
  const mask = (1n << BigInt(bitWidth)) - 1n;
  return value & mask;
}

function bitwiseOp(a: bigint, b: bigint, op: BitwiseOp, bitWidth: BitWidth): bigint {
  const mask = (1n << BigInt(bitWidth)) - 1n;
  const ua = a & mask;
  const ub = b & mask;
  switch (op) {
    case 'AND': return ua & ub;
    case 'OR':  return ua | ub;
    case 'XOR': return ua ^ ub;
    case 'NOT': return (~ua) & mask;
    case 'SHL': return (ua << ub) & mask;
    case 'SHR': return ua >> ub;
  }
}

function floatToIEEE754(input: string): {
  sign: number;
  exponent: string;
  mantissa: string;
  decimal: number;
  bits: string;
  isSpecial: string | null;
} | null {
  const num = parseFloat(input);
  if (input.trim() === '' || isNaN(num)) return null;

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, num);

  const high = view.getUint32(0);
  const low = view.getUint32(4);

  const sign = (high >>> 31) & 1;
  const exponentBits = (high >>> 20) & 0x7FF;
  const mantissaHigh = high & 0xFFFFF;

  const exponentStr = exponentBits.toString(2).padStart(11, '0');
  const mantissaStr = mantissaHigh.toString(2).padStart(20, '0') + low.toString(2).padStart(32, '0');

  const bits =
    sign.toString() + ' ' +
    groupDigits(exponentStr, 4, ' ') + ' ' +
    groupDigits(mantissaStr, 4, ' ');

  let isSpecial: string | null = null;
  if (exponentBits === 0x7FF) {
    isSpecial = mantissaStr === '0'.repeat(52) ? (sign ? '-Infinity' : '+Infinity') : 'NaN';
  } else if (exponentBits === 0 && mantissaStr === '0'.repeat(52)) {
    isSpecial = sign ? '-0' : '+0';
  }

  return {
    sign,
    exponent: exponentStr,
    mantissa: mantissaStr,
    decimal: num,
    bits,
    isSpecial,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  const [input, setInput] = useState(() => loadState().input);
  const [bitWidth, setBitWidth] = useState<BitWidth>(32);
  const [signed, setSigned] = useState(false);
  const [customBase, setCustomBase] = useState('7');
  const [copied, setCopied] = useState<string | null>(null);

  // Bitwise state
  const [bwA, setBwA] = useState('');
  const [bwB, setBwB] = useState('');
  const [bwOp, setBwOp] = useState<BitwiseOp>('AND');

  // Float inspector
  const [floatInput, setFloatInput] = useState('');
  const [floatOpen, setFloatOpen] = useState(false);

  // Persist input
  useEffect(() => { saveState(input); }, [input]);

  // Parse main input
  const parsed = useMemo(() => detectBase(input), [input]);
  const value = parsed ? maskToWidth(parsed.value, bitWidth, signed) : null;
  const unsignedValue = value !== null ? toUnsigned(value, bitWidth) : null;

  // Standard base representations
  const bases = useMemo(() => {
    if (unsignedValue === null) return null;
    return {
      bin: bigintToBase(unsignedValue, 2).padStart(bitWidth, '0'),
      oct: bigintToBase(unsignedValue, 8),
      dec: signed && value !== null ? value.toString() : unsignedValue.toString(),
      hex: bigintToBase(unsignedValue, 16),
    };
  }, [unsignedValue, value, bitWidth, signed]);

  // Custom base
  const customBaseNum = parseInt(customBase, 10);
  const customResult = useMemo(() => {
    if (unsignedValue === null || isNaN(customBaseNum) || customBaseNum < 2 || customBaseNum > 36) return '';
    return bigintToBase(unsignedValue, customBaseNum);
  }, [unsignedValue, customBaseNum]);

  // Bit array for visualization
  const bits = useMemo(() => {
    if (unsignedValue === null) return Array(bitWidth).fill(false);
    const arr: boolean[] = [];
    for (let i = bitWidth - 1; i >= 0; i--) {
      arr.push(((unsignedValue >> BigInt(i)) & 1n) === 1n);
    }
    return arr;
  }, [unsignedValue, bitWidth]);

  // Bitwise operation result
  const bwResult = useMemo(() => {
    const a = detectBase(bwA);
    const b = detectBase(bwB);
    if (!a) return null;
    if (bwOp === 'NOT') {
      const r = bitwiseOp(a.value, 0n, bwOp, bitWidth);
      return {
        dec: r.toString(),
        bin: bigintToBase(r, 2).padStart(bitWidth, '0'),
        hex: bigintToBase(r, 16).toUpperCase(),
      };
    }
    if (!b) return null;
    const r = bitwiseOp(a.value, b.value, bwOp, bitWidth);
    return {
      dec: r.toString(),
      bin: bigintToBase(r, 2).padStart(bitWidth, '0'),
      hex: bigintToBase(r, 16).toUpperCase(),
    };
  }, [bwA, bwB, bwOp, bitWidth]);

  // Float inspector
  const floatResult = useMemo(() => floatToIEEE754(floatInput), [floatInput]);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
      trackEvent('base_convert_copy', { label });
    }).catch(() => {});
  }, []);

  const handleBitToggle = useCallback((index: number) => {
    if (unsignedValue === null) return;
    const bitPos = BigInt(bitWidth - 1 - index);
    const toggled = unsignedValue ^ (1n << bitPos);
    const displayValue = signed ? maskToWidth(toggled, bitWidth, true) : toggled;
    setInput(displayValue.toString());
  }, [unsignedValue, bitWidth, signed]);

  const handleBaseFieldEdit = useCallback((newVal: string, base: number) => {
    const parsed = parseFromBase(newVal, base);
    if (parsed !== null) {
      const masked = maskToWidth(parsed, bitWidth, signed);
      setInput(masked.toString());
    }
  }, [bitWidth, signed]);

  const detectedBaseLabel = parsed
    ? parsed.base === 2 ? 'Binary' : parsed.base === 8 ? 'Octal' : parsed.base === 16 ? 'Hex' : 'Decimal'
    : null;

  return (
    <Layout title="Number Base Converter">
      <div className={styles.container}>
        {/* Input */}
        <Card>
          <div className={styles.inputSection}>
            <label className={styles.fieldLabel}>Input Number</label>
            <input
              className={styles.mainInput}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter number (0b, 0o, 0x prefix or decimal)"
              spellCheck={false}
            />
            {detectedBaseLabel && (
              <span className={styles.detectedBadge}>Detected: {detectedBaseLabel}</span>
            )}
            <div className={styles.controls}>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>Bit Width</span>
                <SegmentedControl
                  options={BIT_WIDTHS.map((w) => ({ label: `${w}`, value: `${w}` }))}
                  value={`${bitWidth}`}
                  onChange={(v) => setBitWidth(parseInt(v, 10) as BitWidth)}
                />
              </div>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>Mode</span>
                <SegmentedControl
                  options={[
                    { label: 'Unsigned', value: 'unsigned' },
                    { label: 'Signed', value: 'signed' },
                  ]}
                  value={signed ? 'signed' : 'unsigned'}
                  onChange={(v) => setSigned(v === 'signed')}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Base representations */}
        {bases && (
          <div className={styles.basesGrid}>
            <BaseCard
              label="Binary"
              prefix="0b"
              raw={bases.bin}
              formatted={formatForBase(bases.bin, 2)}
              base={2}
              copied={copied}
              onCopy={handleCopy}
              onEdit={handleBaseFieldEdit}
            />
            <BaseCard
              label="Octal"
              prefix="0o"
              raw={bases.oct}
              formatted={formatForBase(bases.oct, 8)}
              base={8}
              copied={copied}
              onCopy={handleCopy}
              onEdit={handleBaseFieldEdit}
            />
            <BaseCard
              label="Decimal"
              prefix=""
              raw={bases.dec}
              formatted={formatForBase(bases.dec, 10)}
              base={10}
              copied={copied}
              onCopy={handleCopy}
              onEdit={handleBaseFieldEdit}
            />
            <BaseCard
              label="Hexadecimal"
              prefix="0x"
              raw={bases.hex}
              formatted={formatForBase(bases.hex, 16)}
              base={16}
              copied={copied}
              onCopy={handleCopy}
              onEdit={handleBaseFieldEdit}
            />
          </div>
        )}

        {/* Custom base */}
        {unsignedValue !== null && (
          <Card>
            <div className={styles.customBaseSection}>
              <div className={styles.customBaseHeader}>
                <span className={styles.fieldLabel}>Custom Base</span>
                <input
                  className={styles.customBaseInput}
                  type="number"
                  min={2}
                  max={36}
                  value={customBase}
                  onChange={(e) => setCustomBase(e.target.value)}
                />
              </div>
              {customBaseNum >= 2 && customBaseNum <= 36 && (
                <div className={styles.customBaseResult}>
                  <span className={styles.monoValue}>{customResult || '0'}</span>
                  <button
                    className={styles.copySmall}
                    onClick={() => handleCopy(customResult || '0', 'custom')}
                  >
                    {copied === 'custom' ? '✓' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Bit visualization */}
        {unsignedValue !== null && (
          <Card>
            <div className={styles.bitSection}>
              <span className={styles.fieldLabel}>Bit Visualization</span>
              <div className={styles.bitGrid}>
                {bits.map((bit, i) => (
                  <div key={i} className={styles.bitCol}>
                    <button
                      className={`${styles.bitSquare} ${bit ? styles.bitOn : styles.bitOff}`}
                      onClick={() => handleBitToggle(i)}
                      aria-label={`Bit ${bitWidth - 1 - i}: ${bit ? '1' : '0'}`}
                    />
                    {(bitWidth <= 32 || i % 4 === 0) && (
                      <span className={styles.bitIndex}>{bitWidth - 1 - i}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Bitwise Operations */}
        <Card>
          <div className={styles.bitwiseSection}>
            <span className={styles.fieldLabel}>Bitwise Operations</span>
            <div className={styles.bitwiseInputs}>
              <input
                className={styles.bwInput}
                type="text"
                value={bwA}
                onChange={(e) => setBwA(e.target.value)}
                placeholder="Value A (e.g. 0xFF)"
                spellCheck={false}
              />
              <div className={styles.bwOpSelector}>
                {BITWISE_OPS.map((op) => (
                  <button
                    key={op.value}
                    className={`${styles.bwOpBtn} ${bwOp === op.value ? styles.bwOpActive : ''}`}
                    onClick={() => setBwOp(op.value)}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
              {bwOp !== 'NOT' && (
                <input
                  className={styles.bwInput}
                  type="text"
                  value={bwB}
                  onChange={(e) => setBwB(e.target.value)}
                  placeholder="Value B (e.g. 0x0F)"
                  spellCheck={false}
                />
              )}
            </div>
            {bwResult && (
              <div className={styles.bwResult}>
                <div className={styles.bwResultRow}>
                  <span className={styles.bwResultLabel}>DEC</span>
                  <span className={styles.monoValue}>{bwResult.dec}</span>
                </div>
                <div className={styles.bwResultRow}>
                  <span className={styles.bwResultLabel}>BIN</span>
                  <span className={styles.monoValue}>{formatForBase(bwResult.bin, 2)}</span>
                </div>
                <div className={styles.bwResultRow}>
                  <span className={styles.bwResultLabel}>HEX</span>
                  <span className={styles.monoValue}>{bwResult.hex}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Floating Point Inspector */}
        <Card>
          <button className={styles.collapsibleHeader} onClick={() => setFloatOpen(!floatOpen)}>
            <span className={styles.fieldLabel}>IEEE 754 Float Inspector</span>
            <span className={styles.toggleArrow} style={{ transform: floatOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
          </button>
          {floatOpen && (
            <div className={styles.floatSection}>
              <input
                className={styles.bwInput}
                type="text"
                value={floatInput}
                onChange={(e) => setFloatInput(e.target.value)}
                placeholder="Enter a floating point number"
                spellCheck={false}
              />
              {floatResult && (
                <div className={styles.floatResult}>
                  {floatResult.isSpecial && (
                    <div className={styles.floatSpecial}>{floatResult.isSpecial}</div>
                  )}
                  <div className={styles.floatRow}>
                    <span className={styles.floatLabel}>Sign</span>
                    <span className={`${styles.monoValue} ${styles.floatSign}`}>
                      {floatResult.sign} ({floatResult.sign === 0 ? '+' : '−'})
                    </span>
                  </div>
                  <div className={styles.floatRow}>
                    <span className={styles.floatLabel}>Exponent</span>
                    <span className={`${styles.monoValue} ${styles.floatExponent}`}>
                      {groupDigits(floatResult.exponent, 4, ' ')}
                    </span>
                  </div>
                  <div className={styles.floatRow}>
                    <span className={styles.floatLabel}>Mantissa</span>
                    <span className={`${styles.monoValue} ${styles.floatMantissa}`}>
                      {groupDigits(floatResult.mantissa, 4, ' ')}
                    </span>
                  </div>
                  <div className={styles.floatBits}>
                    <span className={styles.floatBitsLabel}>64-bit representation</span>
                    <code className={styles.floatBitsValue}>{floatResult.bits}</code>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/*  BaseCard sub-component                                             */
/* ------------------------------------------------------------------ */

function BaseCard({
  label,
  prefix,
  raw,
  formatted,
  base,
  copied,
  onCopy,
  onEdit,
}: {
  label: string;
  prefix: string;
  raw: string;
  formatted: string;
  base: number;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
  onEdit: (val: string, base: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = useCallback(() => {
    setEditValue(raw);
    setEditing(true);
  }, [raw]);

  const handleFinishEdit = useCallback(() => {
    setEditing(false);
    onEdit(editValue, base);
  }, [editValue, base, onEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishEdit();
    if (e.key === 'Escape') setEditing(false);
  }, [handleFinishEdit]);

  const copyLabel = label.toLowerCase();

  return (
    <div className={styles.baseCard}>
      <div className={styles.baseCardHeader}>
        <span className={styles.baseLabel}>{label}</span>
        <button
          className={styles.copySmall}
          onClick={() => onCopy(prefix + raw, copyLabel)}
        >
          {copied === copyLabel ? '✓' : 'Copy'}
        </button>
      </div>
      {editing ? (
        <input
          className={styles.baseEditInput}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
        />
      ) : (
        <button className={styles.baseValue} onClick={handleStartEdit} title="Click to edit">
          {prefix && <span className={styles.basePrefix}>{prefix}</span>}
          {formatted}
        </button>
      )}
    </div>
  );
}
