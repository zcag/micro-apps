import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  haptic?: boolean;
}

const base: React.CSSProperties = {
  borderRadius: '8px',
  padding: '10px 20px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  transition: 'background-color 0.2s ease, opacity 0.2s ease',
  width: '100%',
};

const variants: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
};

export function Button({ variant = 'primary', haptic = false, onClick, style, ...props }: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (haptic && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onClick?.(e);
  };

  return (
    <button
      style={{ ...base, ...variants[variant], ...style }}
      onClick={handleClick}
      {...props}
    />
  );
}
