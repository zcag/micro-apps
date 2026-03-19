import React from 'react';

interface PaywallPromptProps {
  onDismiss: () => void;
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: 'var(--card-bg)',
    borderRadius: '16px',
    padding: '32px 24px',
    maxWidth: '380px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--text-secondary)',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  features: {
    listStyle: 'none' as const,
    padding: 0,
    margin: '0 0 24px 0',
    textAlign: 'left' as const,
  },
  feature: {
    padding: '8px 0',
    fontSize: '14px',
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
  },
  ctaButton: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 600,
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  dismissButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '8px',
  },
};

const features = [
  'Remove all ads',
  'Unlimited calculations',
  'Save & export results',
  'Priority support',
];

export function PaywallPrompt({ onDismiss }: PaywallPromptProps) {
  return (
    <div style={styles.overlay} onClick={onDismiss}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>Go Pro</div>
        <div style={styles.subtitle}>
          Unlock the full experience with a Pro subscription.
        </div>
        <ul style={styles.features}>
          {features.map((f) => (
            <li key={f} style={styles.feature}>
              {f}
            </li>
          ))}
        </ul>
        <button style={styles.ctaButton}>Start Free Trial</button>
        <button style={styles.dismissButton} onClick={onDismiss}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
