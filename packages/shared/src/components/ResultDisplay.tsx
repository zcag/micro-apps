import React, { useCallback, useState } from 'react';

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
    padding: '12px 16px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
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
  },
  unit: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  copyButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    transition: 'background-color 0.2s ease',
    flexShrink: 0,
  },
};

export function ResultDisplay({ label, value, unit, style }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = unit ? `${value} ${unit}` : String(value);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value, unit]);

  return (
    <div style={{ ...styles.container, ...style }}>
      <div style={styles.left}>
        <span style={styles.label}>{label}</span>
        <div style={styles.valueRow}>
          <span style={styles.value}>{value}</span>
          {unit && <span style={styles.unit}>{unit}</span>}
        </div>
      </div>
      <button style={styles.copyButton} onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
