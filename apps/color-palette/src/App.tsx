import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

// --- Types ---

interface PaletteColor {
  h: number;
  s: number;
  l: number;
  locked: boolean;
}

type HarmonyMode = 'analogous' | 'complementary' | 'triadic' | 'monochromatic' | 'random';
type ExportFormat = 'css' | 'tailwind' | 'json' | 'png';

// --- Color Math ---

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function colorToHex(c: PaletteColor): string {
  const [r, g, b] = hslToRgb(c.h, c.s, c.l);
  return rgbToHex(r, g, b);
}

function colorToRgbString(c: PaletteColor): string {
  const [r, g, b] = hslToRgb(c.h, c.s, c.l);
  return `rgb(${r}, ${g}, ${b})`;
}

function colorToHslString(c: PaletteColor): string {
  return `hsl(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%)`;
}

function textColorForBg(c: PaletteColor): string {
  return c.l > 55 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
}

function textColorMuted(c: PaletteColor): string {
  return c.l > 55 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
}

// --- Contrast / Accessibility ---

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(c1: PaletteColor, c2: PaletteColor): number {
  const rgb1 = hslToRgb(c1.h, c1.s, c1.l);
  const rgb2 = hslToRgb(c2.h, c2.s, c2.l);
  const l1 = getRelativeLuminance(...rgb1);
  const l2 = getRelativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function wcagLevel(ratio: number): { label: string; pass: boolean } {
  if (ratio >= 7) return { label: 'AAA', pass: true };
  if (ratio >= 4.5) return { label: 'AA', pass: true };
  if (ratio >= 3) return { label: 'AA Large', pass: true };
  return { label: 'Fail', pass: false };
}

// --- Palette Generation ---

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function generatePalette(mode: HarmonyMode, existing: PaletteColor[]): PaletteColor[] {
  const baseHue = Math.random() * 360;
  const colors: PaletteColor[] = [];

  switch (mode) {
    case 'analogous': {
      for (let i = 0; i < 5; i++) {
        colors.push({
          h: wrapHue(baseHue + (i - 2) * 15),
          s: rand(55, 85),
          l: rand(40, 65),
          locked: false,
        });
      }
      break;
    }
    case 'complementary': {
      const comp = wrapHue(baseHue + 180);
      colors.push({ h: baseHue, s: rand(60, 85), l: rand(40, 55), locked: false });
      colors.push({ h: baseHue, s: rand(45, 65), l: rand(65, 80), locked: false });
      colors.push({ h: wrapHue(baseHue + rand(-15, 15)), s: rand(30, 50), l: rand(50, 65), locked: false });
      colors.push({ h: comp, s: rand(60, 85), l: rand(40, 55), locked: false });
      colors.push({ h: comp, s: rand(45, 65), l: rand(65, 80), locked: false });
      break;
    }
    case 'triadic': {
      const h1 = baseHue;
      const h2 = wrapHue(baseHue + 120);
      const h3 = wrapHue(baseHue + 240);
      colors.push({ h: h1, s: rand(60, 85), l: rand(45, 60), locked: false });
      colors.push({ h: h2, s: rand(60, 85), l: rand(45, 60), locked: false });
      colors.push({ h: h3, s: rand(60, 85), l: rand(45, 60), locked: false });
      colors.push({ h: h1, s: rand(35, 55), l: rand(70, 82), locked: false });
      colors.push({ h: h2, s: rand(35, 55), l: rand(70, 82), locked: false });
      break;
    }
    case 'monochromatic': {
      for (let i = 0; i < 5; i++) {
        colors.push({
          h: baseHue,
          s: rand(25 + i * 12, 35 + i * 12),
          l: 25 + i * 13 + rand(-3, 3),
          locked: false,
        });
      }
      break;
    }
    case 'random': {
      for (let i = 0; i < 5; i++) {
        colors.push({
          h: Math.random() * 360,
          s: rand(50, 90),
          l: rand(35, 70),
          locked: false,
        });
      }
      break;
    }
  }

  return colors.map((color, i) => {
    if (existing[i]?.locked) return existing[i];
    return color;
  });
}

// --- Export Helpers ---

function exportCSS(palette: PaletteColor[]): string {
  const vars = palette.map((c, i) => `  --color-${i + 1}: ${colorToHex(c)};`).join('\n');
  return `:root {\n${vars}\n}`;
}

function exportTailwind(palette: PaletteColor[]): string {
  const entries = palette.map((c, i) => `      '${i + 1}': '${colorToHex(c)}',`).join('\n');
  return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        palette: {\n${entries}\n        },\n      },\n    },\n  },\n};`;
}

function exportJSON(palette: PaletteColor[]): string {
  const arr = palette.map(c => colorToHex(c));
  return JSON.stringify(arr, null, 2);
}

function exportPNG(palette: PaletteColor[]): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width / palette.length;

  palette.forEach((c, i) => {
    ctx.fillStyle = colorToHex(c);
    ctx.fillRect(i * w, 0, w, canvas.height);
    // Add hex label
    ctx.fillStyle = textColorForBg(c);
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(colorToHex(c).toUpperCase(), i * w + w / 2, canvas.height / 2);
  });

  const link = document.createElement('a');
  link.download = 'palette.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// --- Component ---

export default function App() {
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [mode, setMode] = useState<HarmonyMode>('analogous');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('css');
  const [exportCopied, setExportCopied] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [genKey, setGenKey] = useState(0);
  const copyTimeoutRef = useRef<number>();
  const exportCopyTimeoutRef = useRef<number>();

  const generate = useCallback(() => {
    setPalette(prev => generatePalette(mode, prev));
    setGenKey(k => k + 1);
    setSelectedIndex(null);
    setCopiedText(null);
    trackEvent('generate_palette', { mode });
  }, [mode]);

  // Generate on mount
  useEffect(() => {
    generate();
  }, [generate]);

  // Show spacebar hint on first visit
  useEffect(() => {
    const seen = localStorage.getItem('color-palette-hint-seen');
    if (!seen) {
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
        localStorage.setItem('color-palette-hint-seen', '1');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        generate();
        if (showHint) {
          setShowHint(false);
          localStorage.setItem('color-palette-hint-seen', '1');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generate, showHint]);

  const toggleLock = (index: number) => {
    setPalette(prev => prev.map((c, i) => i === index ? { ...c, locked: !c.locked } : c));
    trackEvent('toggle_lock', { index: String(index) });
  };

  const handleCopyColor = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedText(text);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = window.setTimeout(() => setCopiedText(null), 1500);
    trackEvent('copy_color', { value: text });
  };

  const handleExportCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setExportCopied(true);
    if (exportCopyTimeoutRef.current) clearTimeout(exportCopyTimeoutRef.current);
    exportCopyTimeoutRef.current = window.setTimeout(() => setExportCopied(false), 2000);
  };

  // Drag and drop
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      setPalette(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      trackEvent('reorder_palette');
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Mobile swipe state
  const touchStartX = useRef(0);
  const [mobileIndex, setMobileIndex] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && mobileIndex < palette.length - 1) setMobileIndex(i => i + 1);
      if (dx > 0 && mobileIndex > 0) setMobileIndex(i => i - 1);
    }
  };

  // Export text
  const getExportText = () => {
    switch (exportFormat) {
      case 'css': return exportCSS(palette);
      case 'tailwind': return exportTailwind(palette);
      case 'json': return exportJSON(palette);
      default: return '';
    }
  };

  if (palette.length === 0) return null;

  return (
    <Layout title="Color Palette">
      <div className={styles.container}>
        {/* Palette Bars */}
        <div className={styles.paletteSection} key={genKey}>
          {palette.map((color, i) => {
            const hex = colorToHex(color);
            const isDragging = dragIndex === i;
            const isDragOver = dragOverIndex === i && dragIndex !== i;

            return (
              <div
                key={i}
                className={`${styles.colorBar} ${isDragging ? styles.colorBarDragging : ''} ${isDragOver ? styles.colorBarDragOver : ''}`}
                style={{
                  backgroundColor: hex,
                  animationDelay: `${i * 60}ms`,
                }}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedIndex(selectedIndex === i ? null : i)}
              >
                {/* Lock button */}
                <button
                  type="button"
                  className={`${styles.lockButton} ${color.locked ? styles.lockButtonLocked : ''}`}
                  style={{ color: textColorForBg(color) }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLock(i);
                  }}
                  title={color.locked ? 'Unlock color' : 'Lock color'}
                >
                  <span className={styles.lockIcon}>
                    {color.locked ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                      </svg>
                    )}
                  </span>
                </button>

                {/* Hover overlay with hex */}
                <div className={styles.colorOverlay} style={{ color: textColorForBg(color) }}>
                  <span className={styles.colorHex}>{hex.toUpperCase()}</span>
                </div>

                {/* Drag indicator dots */}
                <div className={styles.dragDots} style={{ color: textColorMuted(color) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/>
                    <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
                    <circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/>
                  </svg>
                </div>

                {/* Selected detail panel */}
                {selectedIndex === i && (
                  <div className={styles.detailPanel} style={{ color: textColorForBg(color) }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={styles.colorValue}
                      style={{ borderColor: textColorMuted(color) }}
                      onClick={() => handleCopyColor(hex.toUpperCase())}
                    >
                      <span className={styles.colorValueLabel}>HEX</span>
                      <span>{hex.toUpperCase()}</span>
                      {copiedText === hex.toUpperCase() && <span className={styles.copiedBadge}>Copied!</span>}
                    </button>
                    <button
                      type="button"
                      className={styles.colorValue}
                      style={{ borderColor: textColorMuted(color) }}
                      onClick={() => handleCopyColor(colorToRgbString(color))}
                    >
                      <span className={styles.colorValueLabel}>RGB</span>
                      <span>{colorToRgbString(color)}</span>
                      {copiedText === colorToRgbString(color) && <span className={styles.copiedBadge}>Copied!</span>}
                    </button>
                    <button
                      type="button"
                      className={styles.colorValue}
                      style={{ borderColor: textColorMuted(color) }}
                      onClick={() => handleCopyColor(colorToHslString(color))}
                    >
                      <span className={styles.colorValueLabel}>HSL</span>
                      <span>{colorToHslString(color)}</span>
                      {copiedText === colorToHslString(color) && <span className={styles.copiedBadge}>Copied!</span>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Mobile swipe overlay */}
          <div
            className={styles.mobileSwipe}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={styles.mobileTrack}
              style={{ transform: `translateX(-${mobileIndex * 100}%)` }}
            >
              {palette.map((color, i) => {
                const hex = colorToHex(color);
                return (
                  <div
                    key={i}
                    className={styles.mobileSlide}
                    style={{ backgroundColor: hex }}
                  >
                    <button
                      type="button"
                      className={`${styles.lockButton} ${color.locked ? styles.lockButtonLocked : ''}`}
                      style={{ color: textColorForBg(color) }}
                      onClick={() => toggleLock(i)}
                    >
                      <span className={styles.lockIcon}>
                        {color.locked ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                          </svg>
                        )}
                      </span>
                    </button>
                    <div className={styles.mobileColorInfo} style={{ color: textColorForBg(color) }}>
                      <div className={styles.mobileHex}>{hex.toUpperCase()}</div>
                      <div className={styles.mobileSecondary}>{colorToRgbString(color)}</div>
                      <div className={styles.mobileSecondary}>{colorToHslString(color)}</div>
                      <button
                        type="button"
                        className={styles.mobileCopy}
                        style={{ borderColor: textColorMuted(color), color: textColorForBg(color) }}
                        onClick={() => handleCopyColor(hex.toUpperCase())}
                      >
                        {copiedText === hex.toUpperCase() ? 'Copied!' : 'Copy HEX'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Swipe dots */}
            <div className={styles.mobileDots}>
              {palette.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.mobileDot} ${i === mobileIndex ? styles.mobileDotActive : ''}`}
                  style={{ backgroundColor: i === mobileIndex ? colorToHex(c) : undefined }}
                  onClick={() => setMobileIndex(i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Spacebar hint */}
        {showHint && (
          <div className={styles.hint}>
            Press <kbd className={styles.kbd}>Space</kbd> to generate a new palette
          </div>
        )}

        {/* Generate button */}
        <div className={styles.generateRow}>
          <Button variant="gradient" haptic onClick={generate}>
            Generate Palette
          </Button>
        </div>

        {/* Mode selector */}
        <Card>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionHeaderIcon}>🎨</span>
            <span>Harmony Mode</span>
            <span className={styles.sectionDivider} />
          </div>
          <SegmentedControl<HarmonyMode>
            options={[
              { label: 'Analogous', value: 'analogous' },
              { label: 'Complement', value: 'complementary' },
              { label: 'Triadic', value: 'triadic' },
              { label: 'Mono', value: 'monochromatic' },
              { label: 'Random', value: 'random' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Card>

        {/* Export section */}
        <Card>
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => setShowExport(v => !v)}
          >
            <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
              <span className={styles.sectionHeaderIcon}>📦</span>
              <span>Export Palette</span>
              <span className={styles.sectionDivider} />
            </div>
            <span className={`${styles.chevron} ${showExport ? styles.chevronOpen : ''}`}>▾</span>
          </button>
          {showExport && (
            <div className={styles.exportContent}>
              <SegmentedControl<ExportFormat>
                options={[
                  { label: 'CSS', value: 'css' },
                  { label: 'Tailwind', value: 'tailwind' },
                  { label: 'JSON', value: 'json' },
                  { label: 'PNG', value: 'png' },
                ]}
                value={exportFormat}
                onChange={setExportFormat}
              />
              {exportFormat !== 'png' ? (
                <div className={styles.exportCode}>
                  <pre className={styles.exportPre}>{getExportText()}</pre>
                  <button
                    type="button"
                    className={`${styles.exportCopyButton} ${exportCopied ? styles.exportCopySuccess : ''}`}
                    onClick={() => handleExportCopy(getExportText())}
                  >
                    {exportCopied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <Button variant="primary" haptic onClick={() => exportPNG(palette)}>
                  Download PNG
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Accessibility section */}
        <Card>
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={() => setShowAccessibility(v => !v)}
          >
            <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
              <span className={styles.sectionHeaderIcon}>♿</span>
              <span>Accessibility</span>
              <span className={styles.sectionDivider} />
            </div>
            <span className={`${styles.chevron} ${showAccessibility ? styles.chevronOpen : ''}`}>▾</span>
          </button>
          {showAccessibility && (
            <div className={styles.accessibilityContent}>
              <p className={styles.accessibilityDesc}>Contrast ratios between adjacent colors:</p>
              {palette.slice(0, -1).map((c, i) => {
                const next = palette[i + 1];
                const ratio = getContrastRatio(c, next);
                const level = wcagLevel(ratio);
                return (
                  <div key={i} className={styles.contrastRow}>
                    <div className={styles.contrastPair}>
                      <span className={styles.contrastSwatch} style={{ backgroundColor: colorToHex(c) }} />
                      <span className={styles.contrastArrow}>↔</span>
                      <span className={styles.contrastSwatch} style={{ backgroundColor: colorToHex(next) }} />
                    </div>
                    <span className={styles.contrastRatio}>{ratio.toFixed(2)}:1</span>
                    <span className={`${styles.contrastBadge} ${level.pass ? styles.contrastPass : styles.contrastFail}`}>
                      {level.label}
                    </span>
                  </div>
                );
              })}
              {/* Text contrast on each color */}
              <p className={styles.accessibilityDesc} style={{ marginTop: 16 }}>White & black text on each color:</p>
              {palette.map((c, i) => {
                const rgb = hslToRgb(c.h, c.s, c.l);
                const whiteL = getRelativeLuminance(255, 255, 255);
                const blackL = getRelativeLuminance(0, 0, 0);
                const bgL = getRelativeLuminance(...rgb);
                const whiteRatio = (Math.max(whiteL, bgL) + 0.05) / (Math.min(whiteL, bgL) + 0.05);
                const blackRatio = (Math.max(blackL, bgL) + 0.05) / (Math.min(blackL, bgL) + 0.05);
                return (
                  <div key={i} className={styles.contrastRow}>
                    <span className={styles.contrastSwatch} style={{ backgroundColor: colorToHex(c) }} />
                    <div className={styles.textContrasts}>
                      <span className={styles.contrastRatio}>White: {whiteRatio.toFixed(1)}:1</span>
                      <span className={`${styles.contrastBadge} ${whiteRatio >= 4.5 ? styles.contrastPass : styles.contrastFail}`}>
                        {whiteRatio >= 7 ? 'AAA' : whiteRatio >= 4.5 ? 'AA' : whiteRatio >= 3 ? 'AA Lg' : 'Fail'}
                      </span>
                      <span className={styles.contrastRatio}>Black: {blackRatio.toFixed(1)}:1</span>
                      <span className={`${styles.contrastBadge} ${blackRatio >= 4.5 ? styles.contrastPass : styles.contrastFail}`}>
                        {blackRatio >= 7 ? 'AAA' : blackRatio >= 4.5 ? 'AA' : blackRatio >= 3 ? 'AA Lg' : 'Fail'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
