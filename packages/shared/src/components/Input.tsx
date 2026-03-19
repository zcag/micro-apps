import React from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  label: string;
  suffix?: string;
  containerStyle?: React.CSSProperties;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    transition: 'border-color 0.2s ease',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '16px',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    minWidth: 0,
  },
  suffix: {
    padding: '10px 12px 10px 0',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
};

export function Input({ label, suffix, containerStyle, ...props }: InputProps) {
  return (
    <div style={{ ...styles.container, ...containerStyle }}>
      <label style={styles.label}>{label}</label>
      <div style={styles.inputWrapper}>
        <input style={styles.input} {...props} />
        {suffix && <span style={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}
