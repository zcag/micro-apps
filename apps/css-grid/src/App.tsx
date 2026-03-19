import { useState, useCallback, useMemo, useEffect } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  GridConfig, GridItem, AlignValue,
  createDefaultConfig, createItem, generateCss, generateHtml,
  saveConfig, loadConfig, parseCss, getItemColor, generateId,
  PRESETS, ALIGN_OPTIONS, UNIT_PRESETS,
} from './grid';
import styles from './App.module.css';

type PreviewWidth = 'mobile' | 'tablet' | 'desktop';
const PREVIEW_WIDTHS: Record<PreviewWidth, string> = { mobile: '375px', tablet: '768px', desktop: '100%' };

export default function App() {
  const [config, setConfig] = useState<GridConfig>(() => loadConfig() || createDefaultConfig());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importCss, setImportCss] = useState('');
  const [copiedCss, setCopiedCss] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('desktop');
  const [editingArea, setEditingArea] = useState(false);
  const [codeTab, setCodeTab] = useState<'css' | 'html'>('css');

  useEffect(() => { saveConfig(config); }, [config]);

  const cssCode = useMemo(() => generateCss(config), [config]);
  const htmlCode = useMemo(() => generateHtml(config), [config]);

  const updateConfig = useCallback((updates: Partial<GridConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const updateTrackValue = useCallback((col: number, value: string, type: 'columns' | 'rows') => {
    setConfig(prev => {
      const arr = [...prev[type]];
      arr[col] = value;
      return { ...prev, [type]: arr };
    });
  }, []);

  const addTrack = useCallback((type: 'columns' | 'rows') => {
    setConfig(prev => {
      if (prev[type].length >= 12) return prev;
      return { ...prev, [type]: [...prev[type], '1fr'] };
    });
    trackEvent('add_track', { type });
  }, []);

  const removeTrack = useCallback((type: 'columns' | 'rows', index: number) => {
    setConfig(prev => {
      if (prev[type].length <= 1) return prev;
      const arr = prev[type].filter((_, i) => i !== index);
      const maxLine = arr.length + 1;
      const items = prev.items.map(item => {
        if (type === 'columns') {
          const cs = Math.min(item.colStart, maxLine - 1);
          const ce = Math.min(item.colEnd, maxLine);
          return { ...item, colStart: cs, colEnd: Math.max(ce, cs + 1) };
        } else {
          const rs = Math.min(item.rowStart, maxLine - 1);
          const re = Math.min(item.rowEnd, maxLine);
          return { ...item, rowStart: rs, rowEnd: Math.max(re, rs + 1) };
        }
      });
      return { ...prev, [type]: arr, items };
    });
    trackEvent('remove_track', { type });
  }, []);

  const addItem = useCallback(() => {
    setConfig(prev => {
      if (prev.items.length >= 20) return prev;
      const item = createItem(1, 1, prev.items.length);
      return { ...prev, items: [...prev.items, item] };
    });
    trackEvent('add_item');
  }, []);

  const removeItem = useCallback((id: string) => {
    setConfig(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
    }));
    if (selectedItem === id) setSelectedItem(null);
    trackEvent('remove_item');
  }, [selectedItem]);

  const updateItem = useCallback((id: string, updates: Partial<GridItem>) => {
    setConfig(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, ...updates } : item),
    }));
  }, []);

  const applyPreset = useCallback((index: number) => {
    const preset = PRESETS[index];
    const items = (preset.config.items || []).map((item, i) => ({
      ...item,
      id: generateId(),
      color: getItemColor(i),
    }));
    setConfig(prev => ({
      ...prev,
      ...preset.config,
      items,
      areaNames: [],
    }));
    setShowPresets(false);
    setSelectedItem(null);
    trackEvent('apply_preset', { name: preset.name });
  }, []);

  const handleImport = useCallback(() => {
    const parsed = parseCss(importCss);
    if (parsed) {
      setConfig(prev => ({ ...prev, ...parsed }));
      setShowImport(false);
      setImportCss('');
      trackEvent('import_css');
    }
  }, [importCss]);

  const copyToClipboard = useCallback((text: string, type: 'css' | 'html') => {
    navigator.clipboard.writeText(text);
    if (type === 'css') {
      setCopiedCss(true);
      setTimeout(() => setCopiedCss(false), 1500);
    } else {
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 1500);
    }
    trackEvent('copy', { type });
  }, []);

  const toggleAreaMode = useCallback(() => {
    if (!editingArea) {
      setConfig(prev => {
        if (prev.areaNames.length === 0) {
          const names = Array.from({ length: prev.rows.length }, (_, r) =>
            Array.from({ length: prev.columns.length }, (_, c) => `area-${r + 1}-${c + 1}`)
          );
          return { ...prev, areaNames: names };
        }
        return prev;
      });
    }
    setEditingArea(e => !e);
  }, [editingArea]);

  const updateAreaName = useCallback((row: number, col: number, name: string) => {
    setConfig(prev => {
      const areas = prev.areaNames.map(r => [...r]);
      if (areas[row]) areas[row][col] = name || '.';
      return { ...prev, areaNames: areas };
    });
  }, []);

  const clearAreas = useCallback(() => {
    setConfig(prev => ({ ...prev, areaNames: [] }));
    setEditingArea(false);
  }, []);

  const selectedItemData = useMemo(
    () => config.items.find(i => i.id === selectedItem) || null,
    [config.items, selectedItem]
  );

  const gridStyle = useMemo(() => ({
    display: 'grid' as const,
    gridTemplateColumns: config.columns.join(' '),
    gridTemplateRows: config.rows.join(' '),
    columnGap: config.columnGap,
    rowGap: config.rowGap,
    justifyItems: config.justifyItems,
    alignItems: config.alignItems,
    justifyContent: config.justifyContent,
    alignContent: config.alignContent,
    width: PREVIEW_WIDTHS[previewWidth],
    maxWidth: '100%',
    minHeight: 300,
    transition: 'all var(--transition-normal) ease',
  }), [config, previewWidth]);

  return (
    <Layout title="CSS Grid Generator">
      <div className={styles.container}>
        {/* Preview Width Toggle */}
        <div className={styles.previewToggle}>
          <SegmentedControl
            options={[
              { label: 'Mobile', value: 'mobile' },
              { label: 'Tablet', value: 'tablet' },
              { label: 'Desktop', value: 'desktop' },
            ]}
            value={previewWidth}
            onChange={setPreviewWidth}
          />
        </div>

        {/* Grid Preview */}
        <Card className={styles.previewCard}>
          <div className={styles.previewArea}>
            <div className={styles.gridPreview} style={gridStyle}>
              {config.items.length === 0 ? (
                Array.from({ length: config.rows.length * config.columns.length }, (_, i) => {
                  const row = Math.floor(i / config.columns.length);
                  const col = i % config.columns.length;
                  return (
                    <div
                      key={i}
                      className={styles.emptyCell}
                      style={{ gridColumn: col + 1, gridRow: row + 1 }}
                    >
                      {editingArea && config.areaNames[row] ? (
                        <input
                          className={styles.areaCellInput}
                          value={config.areaNames[row]?.[col] || '.'}
                          onChange={e => updateAreaName(row, col, e.target.value)}
                        />
                      ) : (
                        <span className={styles.cellLabel}>
                          {config.areaNames[row]?.[col] || `${row + 1}:${col + 1}`}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                config.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`${styles.gridItem} ${selectedItem === item.id ? styles.gridItemSelected : ''}`}
                    style={{
                      gridColumn: `${item.colStart} / ${item.colEnd}`,
                      gridRow: `${item.rowStart} / ${item.rowEnd}`,
                      backgroundColor: item.color + '30',
                      borderColor: item.color,
                      justifySelf: item.justifySelf === 'auto' ? undefined : item.justifySelf,
                      alignSelf: item.alignSelf === 'auto' ? undefined : item.alignSelf,
                      animationDelay: `${idx * 50}ms`,
                    }}
                    onClick={() => setSelectedItem(item.id === selectedItem ? null : item.id)}
                  >
                    <span className={styles.itemLabel} style={{ color: item.color }}>
                      {item.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className={styles.actionsRow}>
          <Button variant="secondary" onClick={addItem}>+ Add Item</Button>
          <Button variant="secondary" onClick={() => setShowImport(v => !v)}>
            {showImport ? 'Cancel' : 'Import CSS'}
          </Button>
          <Button variant="secondary" onClick={() => setShowPresets(v => !v)}>
            {showPresets ? 'Hide Presets' : 'Presets'}
          </Button>
          <Button variant="secondary" onClick={toggleAreaMode}>
            {editingArea ? 'Done Areas' : 'Named Areas'}
          </Button>
          {config.areaNames.length > 0 && (
            <Button variant="secondary" onClick={clearAreas}>Clear Areas</Button>
          )}
        </div>

        {/* Import Panel */}
        {showImport && (
          <Card className="animate-fadeInUp">
            <div className={styles.importPanel}>
              <textarea
                className={styles.importTextarea}
                placeholder="Paste your CSS grid code here..."
                value={importCss}
                onChange={e => setImportCss(e.target.value)}
                rows={5}
              />
              <Button variant="primary" onClick={handleImport}>Apply</Button>
            </div>
          </Card>
        )}

        {/* Presets */}
        {showPresets && (
          <Card className="animate-fadeInUp">
            <h3 className={styles.sectionTitle}>Presets</h3>
            <div className={styles.presetGrid}>
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.name}
                  className={styles.presetItem}
                  onClick={() => applyPreset(i)}
                >
                  <div
                    className={styles.presetPreview}
                    style={{
                      gridTemplateColumns: preset.config.columns.join(' '),
                      gridTemplateRows: preset.config.rows.join(' '),
                      gap: preset.config.columnGap || '4px',
                    }}
                  >
                    {(preset.config.items || []).map((item, j) => (
                      <div
                        key={j}
                        className={styles.presetCell}
                        style={{
                          gridColumn: `${item.colStart} / ${item.colEnd}`,
                          gridRow: `${item.rowStart} / ${item.rowEnd}`,
                          backgroundColor: getItemColor(j) + '40',
                        }}
                      />
                    ))}
                  </div>
                  <span className={styles.presetName}>{preset.name}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Grid Structure Controls */}
        <Card>
          <h3 className={styles.sectionTitle}>Columns</h3>
          <div className={styles.trackList}>
            {config.columns.map((col, i) => (
              <div key={i} className={styles.trackItem}>
                <span className={styles.trackIndex}>{i + 1}</span>
                <input
                  className={styles.trackInput}
                  value={col}
                  onChange={e => updateTrackValue(i, e.target.value, 'columns')}
                  list="unit-presets"
                />
                <button
                  className={styles.trackRemove}
                  onClick={() => removeTrack('columns', i)}
                  disabled={config.columns.length <= 1}
                >
                  &times;
                </button>
              </div>
            ))}
            <button className={styles.addTrackBtn} onClick={() => addTrack('columns')}>
              + Column
            </button>
          </div>

          <h3 className={styles.sectionTitle} style={{ marginTop: 16 }}>Rows</h3>
          <div className={styles.trackList}>
            {config.rows.map((row, i) => (
              <div key={i} className={styles.trackItem}>
                <span className={styles.trackIndex}>{i + 1}</span>
                <input
                  className={styles.trackInput}
                  value={row}
                  onChange={e => updateTrackValue(i, e.target.value, 'rows')}
                  list="unit-presets"
                />
                <button
                  className={styles.trackRemove}
                  onClick={() => removeTrack('rows', i)}
                  disabled={config.rows.length <= 1}
                >
                  &times;
                </button>
              </div>
            ))}
            <button className={styles.addTrackBtn} onClick={() => addTrack('rows')}>
              + Row
            </button>
          </div>
          <datalist id="unit-presets">
            {UNIT_PRESETS.map(u => <option key={u} value={u} />)}
          </datalist>
        </Card>

        {/* Gap Controls */}
        <Card>
          <h3 className={styles.sectionTitle}>Gap</h3>
          <div className={styles.gapRow}>
            <label className={styles.controlLabel}>
              Column Gap
              <input
                className={styles.gapInput}
                value={config.columnGap}
                onChange={e => updateConfig({ columnGap: e.target.value })}
              />
            </label>
            <label className={styles.controlLabel}>
              Row Gap
              <input
                className={styles.gapInput}
                value={config.rowGap}
                onChange={e => updateConfig({ rowGap: e.target.value })}
              />
            </label>
          </div>
        </Card>

        {/* Alignment Controls */}
        <Card>
          <h3 className={styles.sectionTitle}>Alignment</h3>
          <div className={styles.alignGrid}>
            {(['justifyItems', 'alignItems', 'justifyContent', 'alignContent'] as const).map(prop => (
              <div key={prop} className={styles.alignControl}>
                <label className={styles.alignLabel}>{prop.replace(/([A-Z])/g, '-$1').toLowerCase()}</label>
                <select
                  className={styles.alignSelect}
                  value={config[prop]}
                  onChange={e => updateConfig({ [prop]: e.target.value as AlignValue })}
                >
                  {ALIGN_OPTIONS.filter(o => o !== 'auto').map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>

        {/* Items List */}
        {config.items.length > 0 && (
          <Card>
            <h3 className={styles.sectionTitle}>Items</h3>
            <div className={styles.itemsList}>
              {config.items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`${styles.itemCard} ${selectedItem === item.id ? styles.itemCardSelected : ''}`}
                  onClick={() => setSelectedItem(item.id === selectedItem ? null : item.id)}
                >
                  <div className={styles.itemHeader}>
                    <div
                      className={styles.itemColorDot}
                      style={{ backgroundColor: item.color }}
                    />
                    <input
                      className={styles.itemNameInput}
                      value={item.name}
                      onChange={e => updateItem(item.id, { name: e.target.value })}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      className={styles.itemRemoveBtn}
                      onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                    >
                      &times;
                    </button>
                  </div>

                  {selectedItem === item.id && (
                    <div className={styles.itemControls} onClick={e => e.stopPropagation()}>
                      <div className={styles.itemControlRow}>
                        <label className={styles.controlLabel}>Color</label>
                        <input
                          type="color"
                          className={styles.colorPicker}
                          value={item.color}
                          onChange={e => updateItem(item.id, { color: e.target.value })}
                        />
                      </div>
                      <div className={styles.itemControlRow}>
                        <label className={styles.controlLabel}>Column</label>
                        <div className={styles.spanInputs}>
                          <input
                            type="number"
                            className={styles.spanInput}
                            value={item.colStart}
                            min={1}
                            max={config.columns.length + 1}
                            onChange={e => updateItem(item.id, { colStart: +e.target.value })}
                          />
                          <span className={styles.spanDivider}>/</span>
                          <input
                            type="number"
                            className={styles.spanInput}
                            value={item.colEnd}
                            min={item.colStart + 1}
                            max={config.columns.length + 1}
                            onChange={e => updateItem(item.id, { colEnd: +e.target.value })}
                          />
                        </div>
                      </div>
                      <div className={styles.itemControlRow}>
                        <label className={styles.controlLabel}>Row</label>
                        <div className={styles.spanInputs}>
                          <input
                            type="number"
                            className={styles.spanInput}
                            value={item.rowStart}
                            min={1}
                            max={config.rows.length + 1}
                            onChange={e => updateItem(item.id, { rowStart: +e.target.value })}
                          />
                          <span className={styles.spanDivider}>/</span>
                          <input
                            type="number"
                            className={styles.spanInput}
                            value={item.rowEnd}
                            min={item.rowStart + 1}
                            max={config.rows.length + 1}
                            onChange={e => updateItem(item.id, { rowEnd: +e.target.value })}
                          />
                        </div>
                      </div>
                      <div className={styles.itemControlRow}>
                        <label className={styles.controlLabel}>justify-self</label>
                        <select
                          className={styles.alignSelect}
                          value={item.justifySelf}
                          onChange={e => updateItem(item.id, { justifySelf: e.target.value as AlignValue })}
                        >
                          {ALIGN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className={styles.itemControlRow}>
                        <label className={styles.controlLabel}>align-self</label>
                        <select
                          className={styles.alignSelect}
                          value={item.alignSelf}
                          onChange={e => updateItem(item.id, { alignSelf: e.target.value as AlignValue })}
                        >
                          {ALIGN_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Code Output */}
        <Card variant="glass">
          <div className={styles.codeHeader}>
            <SegmentedControl
              options={[
                { label: 'CSS', value: 'css' },
                { label: 'HTML', value: 'html' },
              ]}
              value={codeTab}
              onChange={setCodeTab}
            />
            <Button
              variant="secondary"
              onClick={() => copyToClipboard(codeTab === 'css' ? cssCode : htmlCode, codeTab)}
            >
              {(codeTab === 'css' ? copiedCss : copiedHtml) ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className={styles.codeBlock}>
            <code className={styles.code}>
              {codeTab === 'css' ? cssCode : htmlCode}
            </code>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
