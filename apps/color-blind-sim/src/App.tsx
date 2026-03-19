import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import {
  CVD_TYPES,
  simulateColorBlindness,
  simulateImage,
  hexToRgb,
  rgbToHex,
  getContrastRatio,
  SAMPLE_GRADIENT,
  loadState,
  saveState,
  type CVDType,
  type RGB,
  type SavedState,
} from './colorBlindness';
import styles from './App.module.css';

type Tab = 'image' | 'picker' | 'palette' | 'contrast';
type ViewMode = 'sideBySide' | 'grid';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(img, 0, 0);
  return canvas;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export default function App() {
  const savedRef = useRef(loadState());
  const [tab, setTab] = useState<Tab>('image');
  const [viewMode, setViewMode] = useState<ViewMode>('sideBySide');
  const [selectedType, setSelectedType] = useState<CVDType>(savedRef.current?.selectedType || 'deuteranopia');
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [pickerColor, setPickerColor] = useState(savedRef.current?.pickerColor || '#FF6B35');
  const [paletteInput, setPaletteInput] = useState(
    (savedRef.current?.paletteColors || ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']).join('\n')
  );
  const [contrastFg, setContrastFg] = useState('#1D1D1F');
  const [contrastBg, setContrastBg] = useState('#FFFFFF');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const simulatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Persist state
  useEffect(() => {
    const state: SavedState = {
      selectedType,
      pickerColor,
      paletteColors: paletteInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean),
    };
    if (sourceCanvas) {
      const dataUrl = canvasToDataUrl(sourceCanvas);
      if (dataUrl.length < 500_000) {
        state.imageDataUrl = dataUrl;
      }
    }
    saveState(state);
  }, [selectedType, pickerColor, paletteInput, sourceCanvas]);

  // Load saved image on mount
  useEffect(() => {
    const saved = savedRef.current;
    if (saved?.imageDataUrl) {
      const img = new Image();
      img.onload = () => setSourceCanvas(imageToCanvas(img));
      img.src = saved.imageDataUrl;
    }
  }, []);

  // Process simulation for side-by-side view
  useEffect(() => {
    if (!sourceCanvas || !simulatedCanvasRef.current) return;
    simulateImage(sourceCanvas, selectedType, simulatedCanvasRef.current);
  }, [sourceCanvas, selectedType]);

  // Process all simulations for grid view
  useEffect(() => {
    if (!sourceCanvas || viewMode !== 'grid') return;
    CVD_TYPES.forEach(cvd => {
      const canvas = gridCanvasRefs.current.get(cvd.type);
      if (canvas) simulateImage(sourceCanvas, cvd.type, canvas);
    });
  }, [sourceCanvas, viewMode]);

  const handleFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f => /^image\/(jpeg|png|webp|gif|bmp|svg)$/i.test(f.type));
    if (valid.length === 0) return;
    try {
      const img = await loadImage(valid[0]);
      // Limit canvas size for performance
      const maxDim = 1920;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      }
      setSourceCanvas(canvas);
      trackEvent('cbs_image_upload');
    } catch {
      // ignore
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = '';
  }, [handleFiles]);

  // Slider drag handling
  const handleSliderPointerDown = useCallback((e: React.PointerEvent) => {
    setIsDraggingSlider(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSliderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingSlider || !comparisonRef.current) return;
    const rect = comparisonRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, x)));
  }, [isDraggingSlider]);

  const handleSliderPointerUp = useCallback(() => {
    setIsDraggingSlider(false);
  }, []);

  // Download simulated image
  const handleDownload = useCallback((type: CVDType) => {
    if (!sourceCanvas) return;
    const tempCanvas = document.createElement('canvas');
    simulateImage(sourceCanvas, type, tempCanvas);
    const url = tempCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulated-${type}.png`;
    a.click();
    trackEvent('cbs_download', { type });
  }, [sourceCanvas]);

  const handleCopy = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopiedField(null), 1500);
  }, []);

  // Color picker simulation
  const pickerRgb = useMemo(() => hexToRgb(pickerColor) || { r: 255, g: 107, b: 53 }, [pickerColor]);

  // Palette colors
  const paletteColors = useMemo(() => {
    return paletteInput
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => ({ hex: s.startsWith('#') ? s : '#' + s, rgb: hexToRgb(s.startsWith('#') ? s : '#' + s) }))
      .filter(c => c.rgb !== null) as { hex: string; rgb: RGB }[];
  }, [paletteInput]);

  // Contrast check
  const contrastFgRgb = useMemo(() => hexToRgb(contrastFg) || { r: 29, g: 29, b: 31 }, [contrastFg]);
  const contrastBgRgb = useMemo(() => hexToRgb(contrastBg) || { r: 255, g: 255, b: 255 }, [contrastBg]);

  // Gradient preview for type cards
  const renderGradientPreview = useCallback((type: CVDType) => {
    const simColors = SAMPLE_GRADIENT.map(c => simulateColorBlindness(c, type));
    const stops = simColors.map((c, i) => {
      const pct = (i / (simColors.length - 1)) * 100;
      return `rgb(${c.r},${c.g},${c.b}) ${pct}%`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, []);

  const selectedInfo = CVD_TYPES.find(c => c.type === selectedType)!;

  return (
    <Layout title="Color Blindness Simulator">
      <main className={styles.main}>
        {/* Tab navigation */}
        <div className={styles.tabs}>
          {([
            { value: 'image' as Tab, label: 'Image' },
            { value: 'picker' as Tab, label: 'Color Picker' },
            { value: 'palette' as Tab, label: 'Palette' },
            { value: 'contrast' as Tab, label: 'Contrast' },
          ]).map(t => (
            <button
              key={t.value}
              className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════ IMAGE TAB ════════ */}
        {tab === 'image' && (
          <>
            {/* Drop zone or image comparison */}
            {!sourceCanvas ? (
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className={styles.fileInput}
                  onChange={handleFileSelect}
                />
                <div className={styles.dropContent}>
                  <div className={styles.dropIcon}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <span className={styles.dropTitle}>Drop an image here or click to browse</span>
                  <span className={styles.dropHint}>Supports JPG, PNG, WebP, GIF — processed entirely in your browser</span>
                </div>
              </div>
            ) : (
              <>
                {/* View mode toggle */}
                <div className={styles.viewToggle}>
                  <button
                    className={`${styles.viewBtn} ${viewMode === 'sideBySide' ? styles.viewBtnActive : ''}`}
                    onClick={() => setViewMode('sideBySide')}
                  >
                    Side by Side
                  </button>
                  <button
                    className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
                    onClick={() => setViewMode('grid')}
                  >
                    Grid View
                  </button>
                  <button className={styles.changeImgBtn} onClick={() => fileInputRef.current?.click()}>
                    Change Image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className={styles.fileInput}
                    onChange={handleFileSelect}
                  />
                </div>

                {viewMode === 'sideBySide' ? (
                  <>
                    {/* Side-by-side comparison with slider */}
                    <Card>
                      <div
                        ref={comparisonRef}
                        className={styles.comparison}
                        onPointerMove={handleSliderPointerMove}
                        onPointerUp={handleSliderPointerUp}
                      >
                        {/* Original image */}
                        <div className={styles.comparisonLayer}>
                          <img
                            src={canvasToDataUrl(sourceCanvas)}
                            alt="Original"
                            className={styles.comparisonImage}
                          />
                          <span className={styles.comparisonLabel} style={{ left: 12 }}>Original</span>
                        </div>

                        {/* Simulated image with clip */}
                        <div
                          className={styles.comparisonLayer}
                          style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                        >
                          <canvas
                            ref={simulatedCanvasRef}
                            className={styles.comparisonImage}
                          />
                          <span className={styles.comparisonLabel} style={{ right: 12 }}>{selectedInfo.name}</span>
                        </div>

                        {/* Slider handle */}
                        <div
                          className={styles.sliderHandle}
                          style={{ left: `${sliderPos}%` }}
                          onPointerDown={handleSliderPointerDown}
                        >
                          <div className={styles.sliderLine} />
                          <div className={styles.sliderGrip}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5l-5 7 5 7M16 5l5 7-5 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Download button */}
                    <div className={styles.downloadRow}>
                      <Button variant="secondary" onClick={() => handleDownload(selectedType)}>
                        Download Simulated Image
                      </Button>
                    </div>
                  </>
                ) : (
                  /* Grid view — all 8 types */
                  <div className={styles.grid}>
                    {/* Original */}
                    <div className={styles.gridItem}>
                      <div className={styles.gridImageWrap}>
                        <img
                          src={canvasToDataUrl(sourceCanvas)}
                          alt="Original"
                          className={styles.gridImage}
                        />
                      </div>
                      <div className={styles.gridInfo}>
                        <span className={styles.gridName}>Normal Vision</span>
                      </div>
                    </div>

                    {CVD_TYPES.map(cvd => (
                      <div
                        key={cvd.type}
                        className={`${styles.gridItem} ${selectedType === cvd.type ? styles.gridItemSelected : ''}`}
                        onClick={() => { setSelectedType(cvd.type); setViewMode('sideBySide'); }}
                      >
                        <div className={styles.gridImageWrap}>
                          <canvas
                            ref={el => { if (el) gridCanvasRefs.current.set(cvd.type, el); }}
                            className={styles.gridImage}
                          />
                        </div>
                        <div className={styles.gridInfo}>
                          <span className={styles.gridName}>{cvd.name}</span>
                          <span className={styles.gridPrevalence}>{cvd.prevalence}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* CVD Type Selector */}
            {(viewMode === 'sideBySide' || !sourceCanvas) && (
              <Card>
                <span className={styles.sectionTitle}>Vision Type</span>
                <div className={styles.typeGrid}>
                  {CVD_TYPES.map(cvd => (
                    <button
                      key={cvd.type}
                      className={`${styles.typeCard} ${selectedType === cvd.type ? styles.typeCardActive : ''}`}
                      onClick={() => { setSelectedType(cvd.type); trackEvent('cbs_type_select', { type: cvd.type }); }}
                    >
                      <div
                        className={styles.typeGradient}
                        style={{ background: renderGradientPreview(cvd.type) }}
                      />
                      <div className={styles.typeInfo}>
                        <span className={styles.typeName}>{cvd.name}</span>
                        <span className={styles.typePrevalence}>{cvd.prevalence}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected type details */}
                <div className={styles.typeDetails}>
                  <div className={styles.typeDetailHeader}>
                    <span className={styles.typeDetailName}>{selectedInfo.name}</span>
                    <span className={`${styles.typeBadge} ${styles[`typeBadge_${selectedInfo.category.replace('-', '_')}`]}`}>
                      {selectedInfo.category === 'red-green' ? 'Red-Green' : selectedInfo.category === 'blue-yellow' ? 'Blue-Yellow' : 'Total'}
                    </span>
                  </div>
                  <p className={styles.typeDetailDesc}>{selectedInfo.description}</p>
                  <div className={styles.typeStats}>
                    <div className={styles.typeStat}>
                      <span className={styles.typeStatLabel}>Prevalence</span>
                      <span className={styles.typeStatValue}>{selectedInfo.prevalence}</span>
                    </div>
                    <div className={styles.typeStat}>
                      <span className={styles.typeStatLabel}>Affected</span>
                      <span className={styles.typeStatValue}>{selectedInfo.affected}</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ════════ COLOR PICKER TAB ════════ */}
        {tab === 'picker' && (
          <>
            <Card>
              <span className={styles.sectionTitle}>Pick a Color</span>
              <div className={styles.pickerRow}>
                <input
                  type="color"
                  value={pickerColor.length === 7 ? pickerColor : '#FF6B35'}
                  onChange={e => setPickerColor(e.target.value.toUpperCase())}
                  className={styles.nativePicker}
                />
                <input
                  className={styles.hexInput}
                  value={pickerColor}
                  onChange={e => setPickerColor(e.target.value.toUpperCase())}
                  placeholder="#FF6B35"
                  spellCheck={false}
                />
                <div
                  className={styles.pickerSwatch}
                  style={{ background: pickerColor }}
                />
              </div>
            </Card>

            <Card>
              <span className={styles.sectionTitle}>How This Color Appears</span>
              <div className={styles.pickerGrid}>
                {/* Normal vision */}
                <div className={styles.pickerItem}>
                  <div
                    className={styles.pickerColor}
                    style={{ background: pickerColor }}
                  />
                  <div className={styles.pickerInfo}>
                    <span className={styles.pickerName}>Normal Vision</span>
                    <span className={styles.pickerHex}>{pickerColor.toUpperCase()}</span>
                  </div>
                </div>

                {CVD_TYPES.map(cvd => {
                  const sim = simulateColorBlindness(pickerRgb, cvd.type);
                  const simHex = rgbToHex(sim.r, sim.g, sim.b).toUpperCase();
                  return (
                    <div key={cvd.type} className={styles.pickerItem}>
                      <div
                        className={styles.pickerColor}
                        style={{ background: simHex }}
                      />
                      <div className={styles.pickerInfo}>
                        <span className={styles.pickerName}>{cvd.name}</span>
                        <span className={styles.pickerHex}>{simHex}</span>
                        <span className={styles.pickerPrevalence}>{cvd.prevalence}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* ════════ PALETTE TAB ════════ */}
        {tab === 'palette' && (
          <>
            <Card>
              <span className={styles.sectionTitle}>Palette Checker</span>
              <p className={styles.sectionDesc}>
                Enter colors (one per line or comma-separated) to check if they remain distinguishable under each type of color vision deficiency.
              </p>
              <textarea
                className={styles.paletteTextarea}
                value={paletteInput}
                onChange={e => setPaletteInput(e.target.value)}
                placeholder="#FF0000&#10;#00FF00&#10;#0000FF"
                rows={5}
                spellCheck={false}
              />
            </Card>

            {paletteColors.length >= 2 && (
              <Card>
                <span className={styles.sectionTitle}>Palette Comparison</span>
                <div className={styles.paletteCompare}>
                  {/* Normal vision row */}
                  <div className={styles.paletteRow}>
                    <span className={styles.paletteLabel}>Normal</span>
                    <div className={styles.paletteSwatches}>
                      {paletteColors.map((c, i) => (
                        <div
                          key={i}
                          className={styles.paletteSwatch}
                          style={{ background: c.hex }}
                          title={c.hex.toUpperCase()}
                        />
                      ))}
                    </div>
                  </div>

                  {CVD_TYPES.map(cvd => {
                    const simColors = paletteColors.map(c => simulateColorBlindness(c.rgb, cvd.type));
                    // Check for confusable pairs (distance < threshold)
                    let hasConfusion = false;
                    for (let i = 0; i < simColors.length && !hasConfusion; i++) {
                      for (let j = i + 1; j < simColors.length; j++) {
                        const dr = simColors[i].r - simColors[j].r;
                        const dg = simColors[i].g - simColors[j].g;
                        const db = simColors[i].b - simColors[j].b;
                        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                        if (dist < 30) { hasConfusion = true; break; }
                      }
                    }

                    return (
                      <div key={cvd.type} className={`${styles.paletteRow} ${hasConfusion ? styles.paletteRowWarn : ''}`}>
                        <span className={styles.paletteLabel}>
                          {cvd.name}
                          {hasConfusion && <span className={styles.paletteWarnIcon} title="Some colors may be confusable">!</span>}
                        </span>
                        <div className={styles.paletteSwatches}>
                          {simColors.map((c, i) => (
                            <div
                              key={i}
                              className={styles.paletteSwatch}
                              style={{ background: rgbToHex(c.r, c.g, c.b) }}
                              title={rgbToHex(c.r, c.g, c.b).toUpperCase()}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ════════ CONTRAST TAB ════════ */}
        {tab === 'contrast' && (
          <>
            <Card>
              <span className={styles.sectionTitle}>Text / Background Contrast Check</span>
              <p className={styles.sectionDesc}>
                Verify if your text/background combination remains readable under each type of color vision deficiency.
              </p>
              <div className={styles.contrastInputs}>
                <div className={styles.contrastField}>
                  <label className={styles.contrastLabel}>Text Color</label>
                  <div className={styles.contrastInputRow}>
                    <input
                      type="color"
                      value={contrastFg.length === 7 ? contrastFg : '#000000'}
                      onChange={e => setContrastFg(e.target.value.toUpperCase())}
                      className={styles.contrastPicker}
                    />
                    <input
                      className={styles.hexInput}
                      value={contrastFg}
                      onChange={e => setContrastFg(e.target.value.toUpperCase())}
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className={styles.contrastField}>
                  <label className={styles.contrastLabel}>Background</label>
                  <div className={styles.contrastInputRow}>
                    <input
                      type="color"
                      value={contrastBg.length === 7 ? contrastBg : '#FFFFFF'}
                      onChange={e => setContrastBg(e.target.value.toUpperCase())}
                      className={styles.contrastPicker}
                    />
                    <input
                      className={styles.hexInput}
                      value={contrastBg}
                      onChange={e => setContrastBg(e.target.value.toUpperCase())}
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <span className={styles.sectionTitle}>Results</span>
              <div className={styles.contrastResults}>
                {/* Normal vision */}
                {(() => {
                  const ratio = getContrastRatio(contrastFgRgb, contrastBgRgb);
                  const aa = ratio >= 4.5;
                  const aaa = ratio >= 7;
                  return (
                    <div className={styles.contrastCard}>
                      <div className={styles.contrastPreview} style={{ background: contrastBg, color: contrastFg }}>
                        <span className={styles.contrastPreviewLarge}>Large Text</span>
                        <span className={styles.contrastPreviewNormal}>Normal body text sample</span>
                      </div>
                      <div className={styles.contrastMeta}>
                        <span className={styles.contrastName}>Normal Vision</span>
                        <span className={`${styles.contrastRatio} ${aa ? styles.contrastPass : styles.contrastFail}`}>
                          {ratio.toFixed(2)}:1
                        </span>
                        <div className={styles.contrastBadges}>
                          <span className={aa ? styles.badgePass : styles.badgeFail}>AA {aa ? '✓' : '✕'}</span>
                          <span className={aaa ? styles.badgePass : styles.badgeFail}>AAA {aaa ? '✓' : '✕'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {CVD_TYPES.map(cvd => {
                  const simFg = simulateColorBlindness(contrastFgRgb, cvd.type);
                  const simBg = simulateColorBlindness(contrastBgRgb, cvd.type);
                  const ratio = getContrastRatio(simFg, simBg);
                  const aa = ratio >= 4.5;
                  const aaa = ratio >= 7;
                  const simFgHex = rgbToHex(simFg.r, simFg.g, simFg.b);
                  const simBgHex = rgbToHex(simBg.r, simBg.g, simBg.b);

                  return (
                    <div key={cvd.type} className={styles.contrastCard}>
                      <div className={styles.contrastPreview} style={{ background: simBgHex, color: simFgHex }}>
                        <span className={styles.contrastPreviewLarge}>Large Text</span>
                        <span className={styles.contrastPreviewNormal}>Normal body text sample</span>
                      </div>
                      <div className={styles.contrastMeta}>
                        <span className={styles.contrastName}>{cvd.name}</span>
                        <span className={`${styles.contrastRatio} ${aa ? styles.contrastPass : styles.contrastFail}`}>
                          {ratio.toFixed(2)}:1
                        </span>
                        <div className={styles.contrastBadges}>
                          <span className={aa ? styles.badgePass : styles.badgeFail}>AA {aa ? '✓' : '✕'}</span>
                          <span className={aaa ? styles.badgePass : styles.badgeFail}>AAA {aaa ? '✓' : '✕'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Copy all results */}
              <button
                className={`${styles.copyBtn} ${copiedField === 'contrast' ? styles.copyBtnDone : ''}`}
                onClick={() => {
                  const lines: string[] = ['Color Blindness Contrast Check', `Text: ${contrastFg} / Background: ${contrastBg}`, ''];
                  const normalRatio = getContrastRatio(contrastFgRgb, contrastBgRgb);
                  lines.push(`Normal Vision: ${normalRatio.toFixed(2)}:1 — AA: ${normalRatio >= 4.5 ? 'PASS' : 'FAIL'}, AAA: ${normalRatio >= 7 ? 'PASS' : 'FAIL'}`);
                  CVD_TYPES.forEach(cvd => {
                    const simFg = simulateColorBlindness(contrastFgRgb, cvd.type);
                    const simBg = simulateColorBlindness(contrastBgRgb, cvd.type);
                    const r = getContrastRatio(simFg, simBg);
                    lines.push(`${cvd.name}: ${r.toFixed(2)}:1 — AA: ${r >= 4.5 ? 'PASS' : 'FAIL'}, AAA: ${r >= 7 ? 'PASS' : 'FAIL'}`);
                  });
                  handleCopy('contrast', lines.join('\n'));
                }}
              >
                {copiedField === 'contrast' ? '✓ Copied!' : 'Copy All Results'}
              </button>
            </Card>
          </>
        )}

        {/* ════════ STATISTICS ════════ */}
        <Card>
          <span className={styles.sectionTitle}>Population Statistics</span>
          <p className={styles.sectionDesc}>
            Approximately 8% of males and 0.5% of females have some form of color vision deficiency.
          </p>
          <div className={styles.statsGrid}>
            {CVD_TYPES.map(cvd => (
              <div key={cvd.type} className={styles.statItem}>
                <div
                  className={styles.statGradient}
                  style={{ background: renderGradientPreview(cvd.type) }}
                />
                <div className={styles.statInfo}>
                  <span className={styles.statName}>{cvd.name}</span>
                  <span className={styles.statPrevalence}>{cvd.prevalence} of population</span>
                  <span className={styles.statAffected}>{cvd.affected}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </Layout>
  );
}
