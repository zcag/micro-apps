import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'gradient' | 'shimmer';
  haptic?: boolean;
}

const base: React.CSSProperties = {
  borderRadius: 'var(--radius-sm)',
  padding: '10px 20px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  width: '100%',
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  gradient: {
    color: '#ffffff',
  },
  shimmer: {
    color: '#ffffff',
  },
};

export function Button({ variant = 'primary', haptic = false, onClick, style, className = '', ...props }: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (haptic && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onClick?.(e);
  };

  const classes = [
    'shared-btn',
    variant === 'primary' ? 'shared-btn--primary' : '',
    variant === 'gradient' ? 'shared-btn--gradient' : '',
    variant === 'shimmer' ? 'shared-btn--shimmer' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      style={{ ...base, ...variantStyles[variant], ...style }}
      onClick={handleClick}
      {...props}
    />
  );
}
