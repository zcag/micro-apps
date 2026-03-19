import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  ShadowLayer,
  ShadowConfig,
  generateCssString,
  generateCssCode,
  createDefaultLayer,
  generateId,
  parseCss,
  loadConfig,
  saveConfig,
  PRESETS,
  DEFAULT_CONFIG,
} from './shadows';
import styles from './App.module.css';

type HistoryEntry = ShadowLayer[];

export default function App() {
  const [config, setConfig] = useState<ShadowConfig>(() => loadConfig() || DEFAULT_CONFIG);
  const [copied, setCopied] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState('');
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(new Set());

  // Undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([config.layers]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);

  // Persist to localStorage
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const pushHistory = useCallback((layers: ShadowLayer[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, layers].slice(-50);
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const updateLayers = useCallback(
    (newLayers: ShadowLayer[]) => {
      setConfig((prev) => ({ ...prev, layers: newLayers }));
      if (!skipHistoryRef.current) {
        pushHistory(newLayers);
      }
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    skipHistoryRef.current = true;
    setConfig((prev) => ({ ...prev, layers: history[newIndex] }));
    skipHistoryRef.current = false;
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    skipHistoryRef.current = true;
    setConfig((prev) => ({ ...prev, layers: history[newIndex] }));
    skipHistoryRef.current = false;
  }, [historyIndex, history]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const cssValue = useMemo(() => generateCssString(config.layers), [config.layers]);
  const cssCode = useMemo(() => generateCssCode(config.layers), [config.layers]);

  const updateLayer = useCallback(
    (id: string, updates: Partial<ShadowLayer>) => {
      const newLayers = config.layers.map((l) => (l.id === id ? { ...l, ...updates } : l));
      updateLayers(newLayers);
    },
    [config.layers, updateLayers],
  );

  const addLayer = useCallback(() => {
    if (config.layers.length >= 10) return;
    const newLayers = [...config.layers, createDefaultLayer()];
    updateLayers(newLayers);
    trackEvent('box_shadow_add_layer');
  }, [config.layers, updateLayers]);

  const removeLayer = useCallback(
    (id: string) => {
      if (config.layers.length <= 1) return;
      const newLayers = config.layers.filter((l) => l.id !== id);
      updateLayers(newLayers);
      trackEvent('box_shadow_remove_layer');
    },
    [config.layers, updateLayers],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      if (config.layers.length >= 10) return;
      const idx = config.layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const clone = { ...config.layers[idx], id: generateId() };
      const newLayers = [...config.layers];
      newLayers.splice(idx + 1, 0, clone);
      updateLayers(newLayers);
    },
    [config.layers, updateLayers],
  );

  const moveLayer = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = config.layers.findIndex((l) => l.id === id);
      const target = idx + dir;
      if (target < 0 || target >= config.layers.length) return;
      const newLayers = [...config.layers];
      [newLayers[idx], newLayers[target]] = [newLayers[target], newLayers[idx]];
      updateLayers(newLayers);
    },
    [config.layers, updateLayers],
  );

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(cssCode);
    setCopied(true);
    trackEvent('box_shadow_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [cssCode]);

  const applyPreset = useCallback(
    (index: number) => {
      const preset = PRESETS[index];
      const newLayers = preset.layers.map((l) => ({ ...l, id: generateId() }));
      updateLayers(newLayers);
      setShowPresets(false);
      setCollapsedLayers(new Set());
      trackEvent('box_shadow_preset', { name: preset.name });
    },
    [updateLayers],
  );

  const handleImport = useCallback(() => {
    const parsed = parseCss(importValue);
    if (!parsed) {
      setImportError('Could not parse box-shadow CSS');
      return;
    }
    updateLayers(parsed);
    setShowImport(false);
    setImportValue('');
    setImportError('');
    setCollapsedLayers(new Set());
    trackEvent('box_shadow_import');
  }, [importValue, updateLayers]);

  const updatePreview = useCallback((updates: Partial<ShadowConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <Layout title="Box Shadow Generator">
      <div className={styles.container}>
        {/* Live Preview */}
        <Card>
          <div className={styles.previewSection}>
            <span className={styles.sectionLabel}>Preview</span>
            <div
              className={styles.previewArea}
              style={{ backgroundColor: config.previewBg }}
            >
              <div
                className={styles.previewBox}
                style={{
                  width: config.previewSize,
                  height: config.previewSize,
                  borderRadius: config.previewRadius,
                  backgroundColor: config.boxColor,
                  boxShadow: cssValue,
                }}
              />
            </div>
            <div className={styles.previewControls}>
              <label className={styles.previewControl}>
                <span className={styles.controlLabel}>Size</span>
                <input
                  type="range"
                  min={60}
                  max={300}
                  value={config.previewSize}
                  onChange={(e) => updatePreview({ previewSize: Number(e.target.value) })}
                  className={styles.slider}
                />
              </label>
              <label className={styles.previewControl}>
                <span className={styles.controlLabel}>Radius</span>
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={config.previewRadius}
                  onChange={(e) => updatePreview({ previewRadius: Number(e.target.value) })}
                  className={styles.slider}
                />
              </label>
              <label className={styles.previewControl}>
                <span className={styles.controlLabel}>Background</span>
                <div className={styles.colorPickerWrap}>
                  <div className={styles.colorSwatch} style={{ background: config.previewBg }} />
                  <input
                    type="color"
                    value={config.previewBg}
                    onChange={(e) => updatePreview({ previewBg: e.target.value })}
                    className={styles.colorInput}
                  />
                </div>
              </label>
              <label className={styles.previewControl}>
                <span className={styles.controlLabel}>Box Color</span>
                <div className={styles.colorPickerWrap}>
                  <div className={styles.colorSwatch} style={{ background: config.boxColor }} />
                  <input
                    type="color"
                    value={config.boxColor}
                    onChange={(e) => updatePreview({ boxColor: e.target.value })}
                    className={styles.colorInput}
                  />
                </div>
              </label>
            </div>
          </div>
        </Card>

        {/* Undo/Redo + Actions */}
        <div className={styles.actionsRow}>
          <button
            className={styles.iconBtn}
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            className={styles.iconBtn}
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>
          <div style={{ flex: 1 }} />
          <Button
            variant="secondary"
            onClick={() => { setShowImport(!showImport); setShowPresets(false); }}
            haptic
          >
            Import CSS
          </Button>
          <Button
            variant="secondary"
            onClick={() => { setShowPresets(!showPresets); setShowImport(false); }}
            haptic
          >
            {showPresets ? '✕ Close' : 'Presets'}
          </Button>
        </div>

        {/* Import Panel */}
        {showImport && (
          <Card>
            <div className={styles.importSection}>
              <span className={styles.sectionLabel}>Import CSS</span>
              <textarea
                className={styles.importInput}
                placeholder="Paste box-shadow CSS here..."
                value={importValue}
                onChange={(e) => { setImportValue(e.target.value); setImportError(''); }}
                rows={3}
              />
              {importError && <span className={styles.errorText}>{importError}</span>}
              <Button variant="primary" onClick={handleImport} haptic style={{ width: '100%' }}>
                Apply
              </Button>
            </div>
          </Card>
        )}

        {/* Presets Gallery */}
        {showPresets && (
          <Card>
            <div className={styles.presetsSection}>
              <span className={styles.sectionLabel}>Shadow Presets</span>
              <div className={styles.presetGrid}>
                {PRESETS.map((preset, i) => (
                  <button
                    key={preset.name}
                    className={styles.presetItem}
                    onClick={() => applyPreset(i)}
                  >
                    <div className={styles.presetPreview}>
                      <div
                        className={styles.presetBox}
                        style={{
                          boxShadow: generateCssString(preset.layers),
                        }}
                      />
                    </div>
                    <span className={styles.presetName}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Shadow Layers */}
        <div className={styles.layersHeader}>
          <span className={styles.sectionLabel}>
            Shadow Layers ({config.layers.length})
          </span>
          <button
            className={styles.addLayerBtn}
            onClick={addLayer}
            disabled={config.layers.length >= 10}
          >
            + Add Layer
          </button>
        </div>

        {config.layers.map((layer, idx) => {
          const isCollapsed = collapsedLayers.has(layer.id);
          return (
            <Card key={layer.id}>
              <div className={styles.layerCard}>
                <div
                  className={styles.layerHeader}
                  onClick={() => toggleCollapsed(layer.id)}
                >
                  <span className={styles.layerChevron}>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <div
                    className={styles.layerPreviewDot}
                    style={{
                      boxShadow: `${layer.inset ? 'inset ' : ''}${layer.offsetX}px ${layer.offsetY}px ${layer.blur}px ${layer.spread}px ${layer.color}`,
                    }}
                  />
                  <span className={styles.layerTitle}>
                    Layer {idx + 1}
                    {layer.inset ? ' (inset)' : ''}
                  </span>
                  <div className={styles.layerActions}>
                    <button
                      className={styles.smallBtn}
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className={styles.smallBtn}
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }}
                      disabled={idx === config.layers.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className={styles.smallBtn}
                      onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }}
                      disabled={config.layers.length >= 10}
                      title="Duplicate"
                    >
                      ⧉
                    </button>
                    <button
                      className={`${styles.smallBtn} ${styles.deleteBtn}`}
                      onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                      disabled={config.layers.length <= 1}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className={styles.layerControls}>
                    {/* Inset Toggle */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Inset</span>
                      <button
                        className={`${styles.toggleBtn} ${layer.inset ? styles.toggleActive : ''}`}
                        onClick={() => updateLayer(layer.id, { inset: !layer.inset })}
                      >
                        {layer.inset ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Offset X */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Offset X</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={layer.offsetX}
                        onChange={(e) => updateLayer(layer.id, { offsetX: Number(e.target.value) })}
                        className={styles.slider}
                      />
                      <span className={styles.controlValue}>{layer.offsetX}px</span>
                    </div>

                    {/* Offset Y */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Offset Y</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={layer.offsetY}
                        onChange={(e) => updateLayer(layer.id, { offsetY: Number(e.target.value) })}
                        className={styles.slider}
                      />
                      <span className={styles.controlValue}>{layer.offsetY}px</span>
                    </div>

                    {/* Blur */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Blur</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={layer.blur}
                        onChange={(e) => updateLayer(layer.id, { blur: Number(e.target.value) })}
                        className={styles.slider}
                      />
                      <span className={styles.controlValue}>{layer.blur}px</span>
                    </div>

                    {/* Spread */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Spread</span>
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        value={layer.spread}
                        onChange={(e) => updateLayer(layer.id, { spread: Number(e.target.value) })}
                        className={styles.slider}
                      />
                      <span className={styles.controlValue}>{layer.spread}px</span>
                    </div>

                    {/* Color */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Color</span>
                      <div className={styles.colorPickerWrap}>
                        <div className={styles.colorSwatch} style={{ background: layer.color }} />
                        <input
                          type="color"
                          value={layer.color}
                          onChange={(e) => updateLayer(layer.id, { color: e.target.value })}
                          className={styles.colorInput}
                        />
                      </div>
                      <input
                        type="text"
                        value={layer.color}
                        onChange={(e) => updateLayer(layer.id, { color: e.target.value })}
                        className={styles.hexInput}
                        maxLength={7}
                      />
                    </div>

                    {/* Opacity */}
                    <div className={styles.controlRow}>
                      <span className={styles.controlLabel}>Opacity</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(layer.opacity * 100)}
                        onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) / 100 })}
                        className={styles.slider}
                      />
                      <span className={styles.controlValue}>{Math.round(layer.opacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

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
      </div>
    </Layout>
  );
}
