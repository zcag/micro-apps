import { useState, useMemo, useCallback } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  GradientType,
  GradientState,
  ColorStop,
  generateId,
  generateCssString,
  createRandomGradient,
  PRESETS,
} from './gradients';
import styles from './App.module.css';

const DEFAULT_STATE: GradientState = {
  type: 'linear',
  angle: 135,
  stops: [
    { id: 'init1', color: '#8b5cf6', position: 0 },
    { id: 'init2', color: '#06b6d4', position: 50 },
    { id: 'init3', color: '#ec4899', position: 100 },
  ],
};

export default function App() {
  const [gradient, setGradient] = useState<GradientState>(DEFAULT_STATE);
  const [copied, setCopied] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [draggingStop, setDraggingStop] = useState<string | null>(null);

  const cssString = useMemo(() => generateCssString(gradient), [gradient]);
  const cssCode = useMemo(() => `background: ${cssString};`, [cssString]);

  const setType = useCallback((type: GradientType) => {
    setGradient((prev) => ({ ...prev, type }));
    trackEvent('gradient_type_change', { type });
  }, []);

  const setAngle = useCallback((angle: number) => {
    setGradient((prev) => ({ ...prev, angle }));
  }, []);

  const updateStop = useCallback((id: string, updates: Partial<ColorStop>) => {
    setGradient((prev) => ({
      ...prev,
      stops: prev.stops.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  }, []);

  const addStop = useCallback(() => {
    setGradient((prev) => {
      if (prev.stops.length >= 8) return prev;
      const sorted = prev.stops.slice().sort((a, b) => a.position - b.position);
      let maxGap = 0;
      let insertPos = 50;
      let colorA = sorted[0]?.color ?? '#ffffff';
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].position - sorted[i].position;
        if (gap > maxGap) {
          maxGap = gap;
          insertPos = Math.round((sorted[i].position + sorted[i + 1].position) / 2);
          colorA = sorted[i].color;
        }
      }
      return {
        ...prev,
        stops: [...prev.stops, { id: generateId(), color: colorA, position: insertPos }],
      };
    });
    trackEvent('gradient_add_stop');
  }, []);

  const removeStop = useCallback((id: string) => {
    setGradient((prev) => {
      if (prev.stops.length <= 2) return prev;
      return { ...prev, stops: prev.stops.filter((s) => s.id !== id) };
    });
    trackEvent('gradient_remove_stop');
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(cssCode);
    setCopied(true);
    trackEvent('gradient_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [cssCode]);

  const handleRandom = useCallback(() => {
    setGradient(createRandomGradient());
    trackEvent('gradient_random');
  }, []);

  const applyPreset = useCallback((index: number) => {
    const preset = PRESETS[index];
    setGradient({
      ...preset.gradient,
      stops: preset.gradient.stops.map((s) => ({ ...s, id: generateId() })),
    });
    trackEvent('gradient_preset', { name: preset.name });
  }, []);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingStop) return;
      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const pos = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      if (gradient.stops.length >= 8) return;
      setGradient((prev) => ({
        ...prev,
        stops: [...prev.stops, { id: generateId(), color: '#ffffff', position: Math.max(0, Math.min(100, pos)) }],
      }));
    },
    [draggingStop, gradient.stops.length],
  );

  const handleStopDrag = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      setDraggingStop(id);
      const bar = e.currentTarget.parentElement!;
      const rect = bar.getBoundingClientRect();

      const onMove = (ev: MouseEvent) => {
        const pos = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
        updateStop(id, { position: Math.max(0, Math.min(100, pos)) });
      };
      const onUp = () => {
        setDraggingStop(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [updateStop],
  );

  const handleStopTouch = useCallback(
    (e: React.TouchEvent<HTMLDivElement>, id: string) => {
      e.stopPropagation();
      setDraggingStop(id);
      const bar = e.currentTarget.parentElement!;
      const rect = bar.getBoundingClientRect();

      const onMove = (ev: TouchEvent) => {
        ev.preventDefault();
        const touch = ev.touches[0];
        const pos = Math.round(((touch.clientX - rect.left) / rect.width) * 100);
        updateStop(id, { position: Math.max(0, Math.min(100, pos)) });
      };
      const onEnd = () => {
        setDraggingStop(null);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
      };
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    },
    [updateStop],
  );

  const sortedStops = useMemo(
    () => gradient.stops.slice().sort((a, b) => a.position - b.position),
    [gradient.stops],
  );

  const showAngle = gradient.type === 'linear' || gradient.type === 'conic';

  return (
    <Layout title="CSS Gradient Generator">
      <div className={styles.container}>
        {/* Live Preview */}
        <div className={styles.previewCard}>
          <div className={styles.preview} style={{ background: cssString }}>
            <div className={styles.previewOverlay}>
              <span className={styles.previewLabel}>{gradient.type} gradient</span>
            </div>
          </div>
        </div>

        {/* Gradient Type */}
        <SegmentedControl
          options={[
            { label: 'Linear', value: 'linear' as GradientType },
            { label: 'Radial', value: 'radial' as GradientType },
            { label: 'Conic', value: 'conic' as GradientType },
          ]}
          value={gradient.type}
          onChange={setType}
        />

        {/* Angle Control */}
        {showAngle && (
          <Card>
            <div className={styles.angleSection}>
              <div className={styles.angleHeader}>
                <span className={styles.sectionLabel}>
                  {gradient.type === 'linear' ? 'Direction' : 'Start Angle'}
                </span>
                <span className={styles.angleValue}>{gradient.angle}°</span>
              </div>
              <div className={styles.angleControl}>
                <div className={styles.angleDial}>
                  <div
                    className={styles.angleKnob}
                    style={{
                      transform: `rotate(${gradient.angle}deg) translateY(-28px)`,
                    }}
                  />
                  <div
                    className={styles.angleLine}
                    style={{ transform: `rotate(${gradient.angle}deg)` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={gradient.angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  className={styles.angleSlider}
                />
              </div>
              <div className={styles.anglePresets}>
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                  <button
                    key={a}
                    className={`${styles.anglePresetBtn} ${gradient.angle === a ? styles.anglePresetActive : ''}`}
                    onClick={() => setAngle(a)}
                  >
                    {a}°
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Color Stops */}
        <Card>
          <div className={styles.stopsSection}>
            <div className={styles.stopsHeader}>
              <span className={styles.sectionLabel}>Color Stops</span>
              <button
                className={styles.addStopBtn}
                onClick={addStop}
                disabled={gradient.stops.length >= 8}
              >
                + Add
              </button>
            </div>

            {/* Gradient Bar with draggable stops */}
            <div className={styles.stopBar} onClick={handleBarClick}>
              <div className={styles.stopBarFill} style={{ background: cssString }} />
              {sortedStops.map((stop) => (
                <div
                  key={stop.id}
                  className={`${styles.stopHandle} ${draggingStop === stop.id ? styles.stopHandleActive : ''}`}
                  style={{ left: `${stop.position}%` }}
                  onMouseDown={(e) => handleStopDrag(e, stop.id)}
                  onTouchStart={(e) => handleStopTouch(e, stop.id)}
                >
                  <div className={styles.stopHandleColor} style={{ background: stop.color }} />
                </div>
              ))}
            </div>

            {/* Stop Editor List */}
            <div className={styles.stopList}>
              {sortedStops.map((stop) => (
                <div key={stop.id} className={styles.stopItem}>
                  <label className={styles.colorPickerWrap}>
                    <div className={styles.colorSwatch} style={{ background: stop.color }} />
                    <input
                      type="color"
                      value={stop.color}
                      onChange={(e) => updateStop(stop.id, { color: e.target.value })}
                      className={styles.colorInput}
                    />
                  </label>
                  <input
                    type="text"
                    value={stop.color}
                    onChange={(e) => updateStop(stop.id, { color: e.target.value })}
                    className={styles.hexInput}
                    maxLength={7}
                  />
                  <div className={styles.positionWrap}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={stop.position}
                      onChange={(e) => updateStop(stop.id, { position: Number(e.target.value) })}
                      className={styles.positionInput}
                    />
                    <span className={styles.positionUnit}>%</span>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeStop(stop.id)}
                    disabled={gradient.stops.length <= 2}
                    title="Remove stop"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* CSS Output */}
        <Card variant="glass">
          <div className={styles.codeSection}>
            <span className={styles.sectionLabel}>CSS Code</span>
            <div className={styles.codeBlock}>
              <code className={styles.code}>{cssCode}</code>
            </div>
            <Button variant="gradient" onClick={handleCopy} haptic style={{ width: '100%' }}>
              {copied ? '✓ Copied!' : 'Copy CSS'}
            </Button>
          </div>
        </Card>

        {/* Actions Row */}
        <div className={styles.actionsRow}>
          <Button variant="secondary" onClick={handleRandom} haptic style={{ flex: 1 }}>
            🎲 Random
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowPresets(!showPresets)}
            haptic
            style={{ flex: 1 }}
          >
            {showPresets ? '✕ Close' : '🎨 Presets'}
          </Button>
        </div>

        {/* Presets Gallery */}
        {showPresets && (
          <Card>
            <div className={styles.presetsSection}>
              <span className={styles.sectionLabel}>Preset Gradients</span>
              <div className={styles.presetGrid}>
                {PRESETS.map((preset, i) => (
                  <button
                    key={preset.name}
                    className={styles.presetItem}
                    onClick={() => {
                      applyPreset(i);
                      setShowPresets(false);
                    }}
                  >
                    <div
                      className={styles.presetSwatch}
                      style={{ background: generateCssString(preset.gradient) }}
                    />
                    <span className={styles.presetName}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
