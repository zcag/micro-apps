import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  backgroundColor: 'var(--card-bg)',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 1px 3px var(--shadow)',
  border: '1px solid var(--border)',
  transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
};

export function Card({ children, style }: CardProps) {
  return <div style={{ ...baseStyle, ...style }}>{children}</div>;
}
