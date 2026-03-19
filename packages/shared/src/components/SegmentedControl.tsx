import React from 'react';

interface SegmentedControlProps<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  style?: React.CSSProperties;
}

const styles = {
  container: {
    display: 'flex',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '8px',
    padding: '2px',
    border: '1px solid var(--border)',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
  option: {
    flex: 1,
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
    textAlign: 'center' as const,
  },
  active: {
    backgroundColor: 'var(--card-bg)',
    color: 'var(--text)',
    boxShadow: '0 1px 2px var(--shadow)',
  },
  inactive: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
  },
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <div style={{ ...styles.container, ...style }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          style={{
            ...styles.option,
            ...(opt.value === value ? styles.active : styles.inactive),
          }}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
