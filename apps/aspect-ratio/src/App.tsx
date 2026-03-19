import { useState, useMemo, useCallback } from 'react';
import { Layout, Card, Button, Input, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

type Mode = 'calculate' | 'lock';

interface Preset {
  label: string;
  w: number;
  h: number;
}

const PRESETS: Preset[] = [
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '1:1', w: 1, h: 1 },
  { label: '9:16', w: 9, h: 16 },
  { label: '21:9', w: 21, h: 9 },
  { label: '3:2', w: 3, h: 2 },
];

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function simplifyRatio(w: number, h: number): [number, number] {
  if (w <= 0 || h <= 0) return [0, 0];
  const d = gcd(w, h);
  return [w / d, h / d];
}

export default function App() {
  const [mode, setMode] = useState<Mode>('calculate');
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [lockField, setLockField] = useState<'width' | 'height'>('width');
  const [lockValue, setLockValue] = useState('1920');
  const [copied, setCopied] = useState(false);

  const w = parseFloat(width) || 0;
  const h = parseFloat(height) || 0;

  const [ratioW, ratioH] = useMemo(() => simplifyRatio(w, h), [w, h]);

  const lockedPreset = activePreset !== null ? PRESETS[activePreset] : null;

  const lockedResult = useMemo(() => {
    if (!lockedPreset) return null;
    const val = parseFloat(lockValue) || 0;
    if (val <= 0) return null;
    if (lockField === 'width') {
      return { width: val, height: Math.round(val * lockedPreset.h / lockedPreset.w) };
    } else {
      return { width: Math.round(val * lockedPreset.w / lockedPreset.h), height: val };
    }
  }, [lockedPreset, lockField, lockValue]);

  const displayRatio = mode === 'calculate'
    ? (ratioW > 0 ? `${ratioW}:${ratioH}` : '—')
    : (lockedPreset ? lockedPreset.label : '—');

  const displayDimensions = mode === 'calculate'
    ? (w > 0 && h > 0 ? `${w} × ${h}` : '')
    : (lockedResult ? `${lockedResult.width} × ${lockedResult.height}` : '');

  const previewW = mode === 'calculate' ? w : (lockedResult?.width ?? 0);
  const previewH = mode === 'calculate' ? h : (lockedResult?.height ?? 0);

  const handleCopy = useCallback(() => {
    const text = displayDimensions ? `${displayRatio} (${displayDimensions})` : displayRatio;
    navigator.clipboard.writeText(text);
    setCopied(true);
    trackEvent('aspect_ratio_copy', { ratio: displayRatio });
    setTimeout(() => setCopied(false), 1500);
  }, [displayRatio, displayDimensions]);

  const handlePresetClick = (index: number) => {
    setActivePreset(index);
    if (mode === 'calculate') {
      const p = PRESETS[index];
      setWidth(String(p.w));
      setHeight(String(p.h));
    }
    trackEvent('aspect_ratio_preset', { preset: PRESETS[index].label });
  };

  const previewStyle = useMemo(() => {
    if (previewW <= 0 || previewH <= 0) return null;
    const maxW = 260;
    const maxH = 180;
    const scale = Math.min(maxW / previewW, maxH / previewH);
    return {
      width: Math.max(previewW * scale, 20),
      height: Math.max(previewH * scale, 20),
    };
  }, [previewW, previewH]);

  return (
    <Layout title="Aspect Ratio Calculator">
      <div className={styles.container}>
        <SegmentedControl
          options={[
            { label: 'Calculate', value: 'calculate' as Mode },
            { label: 'Lock Ratio', value: 'lock' as Mode },
          ]}
          value={mode}
          onChange={setMode}
        />

        <Card variant="glass">
          <div className={styles.presetLabel}>Common Ratios</div>
          <div className={styles.presetGrid}>
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                className={`${styles.presetBtn} ${activePreset === i ? styles.presetActive : ''}`}
                onClick={() => handlePresetClick(i)}
              >
                <span className={styles.presetRatio}>{p.label}</span>
                <span className={styles.presetDesc}>
                  {p.w > p.h ? 'Landscape' : p.w < p.h ? 'Portrait' : 'Square'}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {mode === 'calculate' ? (
          <Card>
            <div className={styles.inputRow}>
              <Input
                label="Width"
                type="number"
                value={width}
                onChange={(e) => {
                  setWidth(e.target.value);
                  setActivePreset(null);
                }}
                suffix="px"
              />
              <span className={styles.times}>×</span>
              <Input
                label="Height"
                type="number"
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  setActivePreset(null);
                }}
                suffix="px"
              />
            </div>
          </Card>
        ) : (
          <Card>
            <div className={styles.lockSection}>
              <SegmentedControl
                options={[
                  { label: 'Set Width', value: 'width' as const },
                  { label: 'Set Height', value: 'height' as const },
                ]}
                value={lockField}
                onChange={setLockField}
              />
              <div className={styles.lockInput}>
                <Input
                  label={lockField === 'width' ? 'Width' : 'Height'}
                  type="number"
                  value={lockValue}
                  onChange={(e) => setLockValue(e.target.value)}
                  suffix="px"
                />
              </div>
              {lockedResult && (
                <div className={styles.calcResult}>
                  <span className={styles.calcLabel}>
                    {lockField === 'width' ? 'Height' : 'Width'}
                  </span>
                  <span className={styles.calcValue}>
                    {lockField === 'width' ? lockedResult.height : lockedResult.width}
                    <span className={styles.calcUnit}>px</span>
                  </span>
                </div>
              )}
              {!lockedPreset && (
                <div className={styles.lockHint}>Select a ratio preset above to lock</div>
              )}
            </div>
          </Card>
        )}

        {(displayRatio !== '—') && (
          <Card variant="glass" hoverable>
            <div className={styles.resultSection}>
              <div className={styles.resultRatio}>{displayRatio}</div>
              {displayDimensions && (
                <div className={styles.resultDimensions}>{displayDimensions}</div>
              )}

              {previewStyle && (
                <div className={styles.previewContainer}>
                  <div className={styles.previewBox} style={previewStyle}>
                    <div className={styles.previewLabel}>
                      {Math.round(previewW)} × {Math.round(previewH)}
                    </div>
                    <div className={styles.previewCorner} style={{ top: 4, left: 4 }} />
                    <div className={styles.previewCorner} style={{ top: 4, right: 4 }} />
                    <div className={styles.previewCorner} style={{ bottom: 4, left: 4 }} />
                    <div className={styles.previewCorner} style={{ bottom: 4, right: 4 }} />
                  </div>
                </div>
              )}

              <Button variant="gradient" onClick={handleCopy} haptic>
                {copied ? '✓ Copied' : 'Copy Result'}
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <div className={styles.useCases}>
            <div className={styles.useCaseTitle}>Common Use Cases</div>
            <div className={styles.useCaseGrid}>
              <div className={styles.useCaseItem}>
                <span className={styles.useCaseIcon}>🎬</span>
                <div>
                  <strong>16:9</strong>
                  <span>YouTube, TV, Widescreen</span>
                </div>
              </div>
              <div className={styles.useCaseItem}>
                <span className={styles.useCaseIcon}>📱</span>
                <div>
                  <strong>9:16</strong>
                  <span>TikTok, Reels, Stories</span>
                </div>
              </div>
              <div className={styles.useCaseItem}>
                <span className={styles.useCaseIcon}>📷</span>
                <div>
                  <strong>3:2</strong>
                  <span>DSLR Photography</span>
                </div>
              </div>
              <div className={styles.useCaseItem}>
                <span className={styles.useCaseIcon}>🖥️</span>
                <div>
                  <strong>21:9</strong>
                  <span>Ultrawide Monitors</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
