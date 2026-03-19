import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  variant?: 'default' | 'glass';
  className?: string;
  hoverable?: boolean;
}

const baseStyle: React.CSSProperties = {
  backgroundColor: 'var(--card-bg)',
  borderRadius: 'var(--radius-md)',
  padding: '16px',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--border)',
};

export function Card({ children, style, variant = 'default', className = '', hoverable = true }: CardProps) {
  const classes = [
    'shared-card',
    variant === 'glass' ? 'shared-card--glass' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        ...baseStyle,
        ...(hoverable ? {} : { transform: 'none' }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
