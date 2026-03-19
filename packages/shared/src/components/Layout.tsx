import React from 'react';
import { useTheme } from '../theme';

interface LayoutProps {
  title: string;
  children: React.ReactNode;
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    transition: 'background-color 0.2s ease, color 0.2s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    backdropFilter: 'blur(10px)',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    color: 'var(--text)',
  },
  themeButton: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '16px',
    color: 'var(--text)',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
  main: {
    flex: 1,
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    boxSizing: 'border-box' as const,
  },
  footer: {
    marginTop: 'auto',
  },
};

export function Layout({ title, children }: LayoutProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        <button
          style={styles.themeButton}
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {isDark ? '\u2600\ufe0f' : '\ud83c\udf19'}
        </button>
      </header>
      <main style={styles.main}>{children}</main>
      <footer style={styles.footer} />
    </div>
  );
}
