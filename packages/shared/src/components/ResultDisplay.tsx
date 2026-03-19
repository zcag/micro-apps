import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ResultDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  style?: React.CSSProperties;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 12px 20px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-sm)',
  },
  left: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  label: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  value: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text)',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  unit: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  copyButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
};

export function ResultDisplay({ label, value, unit, style }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value && value !== 0 && value !== '0') {
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), 400);
      prevValueRef.current = value;
      return () => clearTimeout(timer);
    }
    prevValueRef.current = value;
  }, [value]);

  const handleCopy = useCallback(() => {
    const text = unit ? `${value} ${unit}` : String(value);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [value, unit]);

  return (
    <div
      className={`shared-result${pulsing ? ' shared-result--pulse' : ''}`}
      style={{ ...styles.container, ...style }}
    >
      <div style={styles.left}>
        <span style={styles.label}>{label}</span>
        <div style={styles.valueRow}>
          <span style={styles.value}>{value}</span>
          {unit && <span style={styles.unit}>{unit}</span>}
        </div>
      </div>
      <button
        className={`shared-copy-btn${copied ? ' shared-copy-btn--copied' : ''}`}
        style={styles.copyButton}
        onClick={handleCopy}
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}
