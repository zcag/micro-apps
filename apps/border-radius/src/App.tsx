import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  BorderRadiusConfig,
  CornerKey,
  CORNER_KEYS,
  CORNER_LABELS,
  DEFAULT_CONFIG,
  PRESETS,
  Unit,
  generateBorderRadiusValue,
  generateCssCode,
  parseBorderRadiusCss,
  loadConfig,
  saveConfig,
} from './borderRadius';
import styles from './App.module.css';

const MAX_VALUE: Record<Unit, number> = { px: 200, '%': 100, em: 20 };

function clampValue(v: number, unit: Unit): number {
  return Math.max(0, Math.min(v, MAX_VALUE[unit]));
}

export default function App() {
  const [config, setConfig] = useState<BorderRadiusConfig>(() => loadConfig() || DEFAULT_CONFIG);
  const [copied, setCopied] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const [morphKey, setMorphKey] = useState(0);
  const draggingRef = useRef<CornerKey | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const borderRadiusValue = useMemo(() => generateBorderRadiusValue(config), [config]);
  const cssCode = useMemo(() => generateCssCode(config), [config]);

  const previewStyle = useMemo(
    () => ({
      width: config.preview.size,
      height: config.preview.size,
      backgroundColor: config.preview.bgColor,
      borderRadius: borderRadiusValue,
      border:
        config.preview.borderWidth > 0
          ? `${config.preview.borderWidth}px solid ${config.preview.borderColor}`
          : 'none',
      transition: 'border-radius var(--transition-normal) ease',
    }),
    [config.preview, borderRadiusValue]
  );

  const updateCorner = useCallback(
    (key: CornerKey, field: 'horizontal' | 'vertical', value: number) => {
      setConfig((prev) => {
        const unit = prev.corners[key].unit;
        const clamped = clampValue(value, unit);
        if (prev.linked) {
          const newCorners = { ...prev.corners };
          CORNER_KEYS.forEach((k) => {
            newCorners[k] = {
              ...newCorners[k],
              horizontal: field === 'horizontal' ? clamped : newCorners[k].horizontal,
              vertical: prev.elliptical
                ? field === 'vertical'
                  ? clamped
                  : newCorners[k].vertical
                : field === 'horizontal'
                  ? clamped
                  : newCorners[k].vertical,
            };
            if (!prev.elliptical) {
              newCorners[k] = { ...newCorners[k], vertical: newCorners[k].horizontal };
            }
          });
          return { ...prev, corners: newCorners };
        }
        const corner = { ...prev.corners[key], [field]: clamped };
        if (!prev.elliptical) {
          corner.vertical = corner.horizontal;
        }
        return { ...prev, corners: { ...prev.corners, [key]: corner } };
      });
    },
    []
  );

  const updateCornerUnit = useCallback((key: CornerKey, unit: Unit) => {
    setConfig((prev) => {
      if (prev.linked) {
        const newCorners = { ...prev.corners };
        CORNER_KEYS.forEach((k) => {
          newCorners[k] = {
            ...newCorners[k],
            unit,
            horizontal: clampValue(newCorners[k].horizontal, unit),
            vertical: clampValue(newCorners[k].vertical, unit),
          };
        });
        return { ...prev, corners: newCorners };
      }
      const c = prev.corners[key];
      return {
        ...prev,
        corners: {
          ...prev.corners,
          [key]: {
            ...c,
            unit,
            horizontal: clampValue(c.horizontal, unit),
            vertical: clampValue(c.vertical, unit),
          },
        },
      };
    });
  }, []);

  const toggleLinked = useCallback(() => {
    setConfig((prev) => {
      if (!prev.linked) {
        // When linking, copy topLeft to all corners
        const tl = prev.corners.topLeft;
        const newCorners = { ...prev.corners };
        CORNER_KEYS.forEach((k) => {
          newCorners[k] = { ...tl };
        });
        return { ...prev, linked: true, corners: newCorners };
      }
      return { ...prev, linked: false };
    });
    trackEvent('border_radius_toggle_link');
  }, []);

  const toggleElliptical = useCallback(() => {
    setConfig((prev) => {
      if (prev.elliptical) {
        // When disabling, set vertical = horizontal
        const newCorners = { ...prev.corners };
        CORNER_KEYS.forEach((k) => {
          newCorners[k] = { ...newCorners[k], vertical: newCorners[k].horizontal };
        });
        return { ...prev, elliptical: false, corners: newCorners };
      }
      return { ...prev, elliptical: true };
    });
    trackEvent('border_radius_toggle_elliptical');
  }, []);

  const togglePrefixes = useCallback(() => {
    setConfig((prev) => ({ ...prev, vendorPrefixes: !prev.vendorPrefixes }));
  }, []);

  const applyPreset = useCallback((index: number) => {
    const preset = PRESETS[index];
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
      corners: preset.config.corners
        ? { ...prev.corners, ...preset.config.corners }
        : prev.corners,
    }));
    setMorphKey((k) => k + 1);
    setShowPresets(false);
    trackEvent('border_radius_preset', { name: preset.name });
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(cssCode);
    setCopied(true);
    trackEvent('border_radius_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [cssCode]);

  const handleImport = useCallback(() => {
    const parsed = parseBorderRadiusCss(importValue);
    if (parsed) {
      setConfig((prev) => ({ ...prev, ...parsed }));
      setImportError('');
      setShowImport(false);
      setImportValue('');
      setMorphKey((k) => k + 1);
      trackEvent('border_radius_import');
    } else {
      setImportError('Could not parse border-radius CSS');
    }
  }, [importValue]);

  const updatePreview = useCallback((field: keyof BorderRadiusConfig['preview'], value: string | number) => {
    setConfig((prev) => ({
      ...prev,
      preview: { ...prev.preview, [field]: value },
    }));
  }, []);

  // Drag handle logic
  const handlePointerDown = useCallback(
    (corner: CornerKey, e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = corner;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const corner = draggingRef.current;
      if (!corner || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const size = config.preview.size;
      const unit = config.corners[corner].unit;
      const max = MAX_VALUE[unit];

      // Map pointer position to radius value based on corner position
      let ratio: number;
      if (corner === 'topLeft') {
        ratio = Math.max(e.clientX - rect.left, e.clientY - rect.top) / size;
      } else if (corner === 'topRight') {
        ratio = Math.max(rect.right - e.clientX, e.clientY - rect.top) / size;
      } else if (corner === 'bottomRight') {
        ratio = Math.max(rect.right - e.clientX, rect.bottom - e.clientY) / size;
      } else {
        ratio = Math.max(e.clientX - rect.left, rect.bottom - e.clientY) / size;
      }
      const value = Math.round(clampValue(ratio * max, unit));
      updateCorner(corner, 'horizontal', value);
      if (config.elliptical) {
        let vRatio: number;
        if (corner === 'topLeft') {
          vRatio = (e.clientY - rect.top) / size;
        } else if (corner === 'topRight') {
          vRatio = (e.clientY - rect.top) / size;
        } else if (corner === 'bottomRight') {
          vRatio = (rect.bottom - e.clientY) / size;
        } else {
          vRatio = (rect.bottom - e.clientY) / size;
        }
        const vValue = Math.round(clampValue(vRatio * max, unit));
        updateCorner(corner, 'vertical', vValue);
      }
    },
    [config.preview.size, config.corners, config.elliptical, updateCorner]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const presetBorderRadius = useCallback((preset: typeof PRESETS[number]) => {
    const c = preset.config.corners;
    if (!c) return '20px';
    const vals = CORNER_KEYS.map(
      (k) => `${c[k].horizontal}${c[k].unit}`
    );
    if (preset.config.elliptical) {
      const hVals = CORNER_KEYS.map((k) => `${c[k].horizontal}${c[k].unit}`);
      const vVals = CORNER_KEYS.map((k) => `${c[k].vertical}${c[k].unit}`);
      return `${hVals.join(' ')} / ${vVals.join(' ')}`;
    }
    return vals.join(' ');
  }, []);

  const responsiveSizes = [
    { label: 'S', size: 60 },
    { label: 'M', size: 100 },
    { label: 'L', size: 160 },
  ];

  return (
    <Layout title="Border Radius Generator">
      <div className={styles.container}>
        {/* Preview */}
        <Card variant="glass">
          <div className={styles.previewSection}>
            <div className={styles.sectionLabel}>Preview</div>
            <div
              className={styles.previewContainer}
              ref={previewRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <div
                className={`${styles.previewBox} ${morphKey ? styles.morphing : ''}`}
                key={morphKey}
                style={previewStyle}
              >
                {CORNER_KEYS.map((corner) => (
                  <div
                    key={corner}
                    className={`${styles.handle} ${styles[`handle${corner.charAt(0).toUpperCase() + corner.slice(1)}` as keyof typeof styles]}`}
                    onPointerDown={(e) => handlePointerDown(corner, e)}
                  />
                ))}
              </div>
            </div>

            {/* Responsive preview */}
            <div className={styles.responsiveRow}>
              {responsiveSizes.map((rs) => (
                <div key={rs.label} className={styles.responsiveItem}>
                  <div className={styles.responsiveLabel}>{rs.label}</div>
                  <div
                    className={styles.responsiveBox}
                    style={{
                      width: rs.size,
                      height: rs.size * 0.6,
                      backgroundColor: config.preview.bgColor,
                      borderRadius: borderRadiusValue,
                      border:
                        config.preview.borderWidth > 0
                          ? `${config.preview.borderWidth}px solid ${config.preview.borderColor}`
                          : 'none',
                      opacity: 0.7,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Toggles */}
        <Card>
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggle} ${config.linked ? styles.toggleActive : ''}`}
              onClick={toggleLinked}
            >
              {config.linked ? '🔗' : '🔓'} {config.linked ? 'Linked' : 'Unlinked'}
            </button>
            <button
              className={`${styles.toggle} ${config.elliptical ? styles.toggleActive : ''}`}
              onClick={toggleElliptical}
            >
              ⬮ Elliptical
            </button>
            <button
              className={`${styles.toggle} ${config.vendorPrefixes ? styles.toggleActive : ''}`}
              onClick={togglePrefixes}
            >
              ⚙ Prefixes
            </button>
          </div>
        </Card>

        {/* Corner controls */}
        <Card>
          <div className={styles.sectionLabel}>Corner Values</div>
          <div className={styles.cornerGrid}>
            {CORNER_KEYS.map((key) => {
              const corner = config.corners[key];
              return (
                <div key={key} className={styles.cornerCard}>
                  <div className={styles.cornerLabel}>
                    <span className={styles.cornerDot} />
                    {CORNER_LABELS[key]}
                  </div>
                  <div className={styles.inputRow}>
                    <input
                      type="number"
                      className={styles.valueInput}
                      value={corner.horizontal}
                      min={0}
                      max={MAX_VALUE[corner.unit]}
                      onChange={(e) =>
                        updateCorner(key, 'horizontal', parseFloat(e.target.value) || 0)
                      }
                    />
                    <select
                      className={styles.unitSelect}
                      value={corner.unit}
                      onChange={(e) => updateCornerUnit(key, e.target.value as Unit)}
                    >
                      <option value="px">px</option>
                      <option value="%">%</option>
                      <option value="em">em</option>
                    </select>
                  </div>
                  <div className={styles.sliderWrap}>
                    <input
                      type="range"
                      className={styles.slider}
                      min={0}
                      max={MAX_VALUE[corner.unit]}
                      value={corner.horizontal}
                      onChange={(e) =>
                        updateCorner(key, 'horizontal', parseFloat(e.target.value))
                      }
                    />
                  </div>
                  {config.elliptical && (
                    <>
                      <div className={styles.ellipticalLabel}>Vertical</div>
                      <div className={styles.inputRow}>
                        <input
                          type="number"
                          className={styles.valueInput}
                          value={corner.vertical}
                          min={0}
                          max={MAX_VALUE[corner.unit]}
                          onChange={(e) =>
                            updateCorner(key, 'vertical', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className={styles.sliderWrap}>
                        <input
                          type="range"
                          className={styles.slider}
                          min={0}
                          max={MAX_VALUE[corner.unit]}
                          value={corner.vertical}
                          onChange={(e) =>
                            updateCorner(key, 'vertical', parseFloat(e.target.value))
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Presets */}
        <Card>
          <div className={styles.buttonRow}>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPresets(!showPresets);
                setShowImport(false);
              }}
            >
              {showPresets ? 'Hide Presets' : 'Presets'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowImport(!showImport);
                setShowPresets(false);
              }}
            >
              {showImport ? 'Hide Import' : 'Import CSS'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings ? 'Hide Settings' : 'Settings'}
            </Button>
          </div>
        </Card>

        {showPresets && (
          <Card variant="glass">
            <div className={styles.sectionLabel}>Shape Presets</div>
            <div className={styles.presetGrid}>
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.name}
                  className={styles.presetItem}
                  onClick={() => applyPreset(i)}
                >
                  <div
                    className={styles.presetSwatch}
                    style={{ borderRadius: presetBorderRadius(preset) }}
                  />
                  <div className={styles.presetName}>{preset.name}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {showImport && (
          <Card variant="glass">
            <div className={styles.sectionLabel}>Import CSS</div>
            <textarea
              className={styles.importTextarea}
              placeholder="Paste border-radius CSS, e.g.: border-radius: 10px 20px 30px 40px;"
              value={importValue}
              onChange={(e) => {
                setImportValue(e.target.value);
                setImportError('');
              }}
            />
            {importError && <div className={styles.importError}>{importError}</div>}
            <Button variant="primary" onClick={handleImport} style={{ marginTop: 8 }}>
              Apply
            </Button>
          </Card>
        )}

        {showSettings && (
          <Card>
            <div className={styles.sectionLabel}>Preview Settings</div>
            <div className={styles.settingsGrid}>
              <div className={styles.settingItem}>
                <div className={styles.settingLabel}>Box Size</div>
                <div className={styles.sliderWrap}>
                  <input
                    type="range"
                    className={styles.slider}
                    min={80}
                    max={360}
                    value={config.preview.size}
                    onChange={(e) => updatePreview('size', parseInt(e.target.value))}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {config.preview.size}px
                  </span>
                </div>
              </div>
              <div className={styles.settingItem}>
                <div className={styles.settingLabel}>Background</div>
                <div className={styles.colorPickerWrap}>
                  <div className={styles.colorSwatch}>
                    <input
                      type="color"
                      value={config.preview.bgColor}
                      onChange={(e) => updatePreview('bgColor', e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    className={styles.colorHex}
                    value={config.preview.bgColor}
                    onChange={(e) => updatePreview('bgColor', e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.settingItem}>
                <div className={styles.settingLabel}>Border Width</div>
                <div className={styles.sliderWrap}>
                  <input
                    type="range"
                    className={styles.slider}
                    min={0}
                    max={20}
                    value={config.preview.borderWidth}
                    onChange={(e) => updatePreview('borderWidth', parseInt(e.target.value))}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {config.preview.borderWidth}px
                  </span>
                </div>
              </div>
              <div className={styles.settingItem}>
                <div className={styles.settingLabel}>Border Color</div>
                <div className={styles.colorPickerWrap}>
                  <div className={styles.colorSwatch}>
                    <input
                      type="color"
                      value={config.preview.borderColor}
                      onChange={(e) => updatePreview('borderColor', e.target.value)}
                    />
                  </div>
                  <input
                    type="text"
                    className={styles.colorHex}
                    value={config.preview.borderColor}
                    onChange={(e) => updatePreview('borderColor', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* CSS Output */}
        <Card variant="glass">
          <div className={styles.sectionLabel}>Generated CSS</div>
          <div className={styles.codeBlock}>
            <code>{cssCode}</code>
          </div>
          <Button
            variant="gradient"
            onClick={handleCopy}
            haptic
            style={{ marginTop: 8 }}
          >
            {copied ? '✓ Copied!' : 'Copy CSS'}
          </Button>
        </Card>
      </div>
    </Layout>
  );
}
