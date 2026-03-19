import React from 'react';

interface AdBannerProps {
  position: 'bottom' | 'inline';
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px dashed var(--border)',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  fontWeight: 500,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  transition: 'background-color 0.2s ease, border-color 0.2s ease',
};

const positionStyles: Record<string, React.CSSProperties> = {
  bottom: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50px',
    borderRadius: 0,
    zIndex: 90,
  },
  inline: {
    height: '60px',
    margin: '16px 0',
  },
};

export function AdBanner({ position }: AdBannerProps) {
  return (
    <div style={{ ...baseStyle, ...positionStyles[position] }}>
      Ad
    </div>
  );
}
