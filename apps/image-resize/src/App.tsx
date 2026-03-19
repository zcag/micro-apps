import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, SegmentedControl, trackEvent } from '@micro-apps/shared';
import { usePaywall, PaywallPrompt, AdBanner } from '@micro-apps/shared';
import styles from './App.module.css';

type ResizeMode = 'pixels' | 'percent' | 'preset';
type OutputFormat = 'jpeg' | 'png' | 'webp';

interface ImageInfo {
  file: File;
  img: HTMLImageElement;
  width: number;
  height: number;
  url: string;
}

interface Preset {
  label: string;
  w: number;
  h: number;
}

const PRESETS: Preset[] = [
  { label: 'Instagram Post', w: 1080, h: 1080 },
  { label: 'Twitter Header', w: 1500, h: 500 },
  { label: 'Facebook Cover', w: 820, h: 312 },
  { label: 'YouTube Thumb', w: 1280, h: 720 },
  { label: 'LinkedIn Banner', w: 1584, h: 396 },
];

const MODE_OPTIONS = [
  { label: 'Pixels', value: 'pixels' as ResizeMode },
  { label: 'Percent', value: 'percent' as ResizeMode },
  { label: 'Presets', value: 'preset' as ResizeMode },
];

const FORMAT_OPTIONS = [
  { label: 'JPG', value: 'jpeg' as OutputFormat },
  { label: 'PNG', value: 'png' as OutputFormat },
  { label: 'WebP', value: 'webp' as OutputFormat },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImage(file: File): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ file, img, width: img.naturalWidth, height: img.naturalHeight, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function resizeImage(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  format: OutputFormat,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas not supported'));

    // Use better quality interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const mime = `image/${format}`;
    const q = format === 'png' ? undefined : quality / 100;
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create blob'))),
      mime,
      q
    );
  });
}

export default function App() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [mode, setMode] = useState<ResizeMode>('pixels');
  const [targetWidth, setTargetWidth] = useState('');
  const [targetHeight, setTargetHeight] = useState('');
  const [percent, setPercent] = useState('50');
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [quality, setQuality] = useState(85);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAspectLock = useRef<'width' | 'height' | null>(null);
  const { showPaywall, dismissPaywall } = usePaywall();

  // When first image loads, set default target dimensions
  useEffect(() => {
    if (images.length > 0 && !targetWidth && !targetHeight) {
      setTargetWidth(String(images[0].width));
      setTargetHeight(String(images[0].height));
    }
  }, [images, targetWidth, targetHeight]);

  const currentImage = images[0] ?? null;

  // Compute output dimensions
  const outputDims = useMemo((): { w: number; h: number } | null => {
    if (!currentImage) return null;
    if (mode === 'pixels') {
      const w = parseInt(targetWidth) || 0;
      const h = parseInt(targetHeight) || 0;
      return w > 0 && h > 0 ? { w, h } : null;
    }
    if (mode === 'percent') {
      const p = parseFloat(percent) || 0;
      if (p <= 0) return null;
      return {
        w: Math.round(currentImage.width * p / 100),
        h: Math.round(currentImage.height * p / 100),
      };
    }
    if (mode === 'preset' && activePreset !== null) {
      const p = PRESETS[activePreset];
      return { w: p.w, h: p.h };
    }
    return null;
  }, [currentImage, mode, targetWidth, targetHeight, percent, activePreset]);

  // Estimate output size
  useEffect(() => {
    if (!currentImage || !outputDims) {
      setEstimatedSize(null);
      return;
    }
    let cancelled = false;
    resizeImage(currentImage.img, outputDims.w, outputDims.h, format, quality)
      .then((blob) => { if (!cancelled) setEstimatedSize(blob.size); })
      .catch(() => { if (!cancelled) setEstimatedSize(null); });
    return () => { cancelled = true; };
  }, [currentImage, outputDims, format, quality]);

  const handleWidthChange = useCallback((val: string) => {
    setTargetWidth(val);
    if (lockAspect && currentImage) {
      const w = parseInt(val) || 0;
      if (w > 0) {
        const ratio = currentImage.height / currentImage.width;
        setTargetHeight(String(Math.round(w * ratio)));
        lastAspectLock.current = 'width';
      }
    }
  }, [lockAspect, currentImage]);

  const handleHeightChange = useCallback((val: string) => {
    setTargetHeight(val);
    if (lockAspect && currentImage) {
      const h = parseInt(val) || 0;
      if (h > 0) {
        const ratio = currentImage.width / currentImage.height;
        setTargetWidth(String(Math.round(h * ratio)));
        lastAspectLock.current = 'height';
      }
    }
  }, [lockAspect, currentImage]);

  const processFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) =>
      /^image\/(jpeg|png|webp|gif)$/i.test(f.type)
    );
    if (valid.length === 0) return;

    const loaded = await Promise.all(valid.map(loadImage));
    setImages(loaded);
    setDownloadReady(false);

    // Set default dims from first image
    const first = loaded[0];
    setTargetWidth(String(first.width));
    setTargetHeight(String(first.height));
    setActivePreset(null);

    trackEvent('image_resize_upload', { count: String(loaded.length) });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const handleDownload = useCallback(async () => {
    if (!outputDims || images.length === 0) return;
    setProcessing(true);
    setBatchProgress(0);

    try {
      for (let i = 0; i < images.length; i++) {
        const info = images[i];
        const blob = await resizeImage(info.img, outputDims.w, outputDims.h, format, quality);
        setBatchProgress(Math.round(((i + 1) / images.length) * 100));

        const ext = format === 'jpeg' ? 'jpg' : format;
        const baseName = info.file.name.replace(/\.[^.]+$/, '');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}-${outputDims.w}x${outputDims.h}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setDownloadReady(true);
      trackEvent('image_resize_download', {
        count: String(images.length),
        format,
        dims: `${outputDims.w}x${outputDims.h}`,
      });
    } catch {
      // ignore
    } finally {
      setProcessing(false);
    }
  }, [images, outputDims, format, quality]);

  const handleClear = useCallback(() => {
    images.forEach((info) => URL.revokeObjectURL(info.url));
    setImages([]);
    setTargetWidth('');
    setTargetHeight('');
    setEstimatedSize(null);
    setDownloadReady(false);
    setActivePreset(null);
  }, [images]);

  const handlePresetClick = useCallback((index: number) => {
    setActivePreset(index);
    trackEvent('image_resize_preset', { preset: PRESETS[index].label });
  }, []);

  const showQuality = format === 'jpeg' || format === 'webp';

  return (
    <Layout title="Image Resizer">
      <div className={styles.container}>
        {/* Drop Zone / Preview */}
        {images.length === 0 ? (
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
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
              <span className={styles.dropTitle}>Drop images here or click to browse</span>
              <span className={styles.dropHint}>Supports JPG, PNG, WebP, GIF — multiple files for batch mode</span>
            </div>
          </div>
        ) : (
          <>
            {/* Image Preview */}
            <Card variant="glass" className={styles.previewCard}>
              <div className={styles.previewHeader}>
                <div className={styles.previewInfo}>
                  <span className={styles.previewLabel}>Original</span>
                  <span className={styles.previewDims}>
                    {currentImage!.width} x {currentImage!.height}
                  </span>
                  <span className={styles.previewSize}>
                    {formatBytes(currentImage!.file.size)}
                  </span>
                </div>
                {images.length > 1 && (
                  <span className={styles.batchBadge}>{images.length} images</span>
                )}
                <button className={styles.clearBtn} onClick={handleClear}>
                  Clear
                </button>
              </div>

              <div className={styles.previewImageWrapper}>
                <img
                  src={currentImage!.url}
                  alt="Preview"
                  className={styles.previewImage}
                />
              </div>

              {images.length > 1 && (
                <div className={styles.thumbnailStrip}>
                  {images.map((info, i) => (
                    <img
                      key={i}
                      src={info.url}
                      alt={info.file.name}
                      className={styles.thumbnail}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* Resize Mode */}
            <Card variant="glass">
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>&#9881;</span>
                <span>Resize Options</span>
              </div>
              <SegmentedControl
                options={MODE_OPTIONS}
                value={mode}
                onChange={(v) => setMode(v as ResizeMode)}
              />

              {mode === 'pixels' && (
                <div className={styles.pixelInputs}>
                  <div className={styles.dimRow}>
                    <Input
                      label="Width"
                      type="number"
                      value={targetWidth}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      suffix="px"
                    />
                    <div className={styles.lockIcon} onClick={() => setLockAspect(!lockAspect)}>
                      {lockAspect ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 019.9-1" />
                        </svg>
                      )}
                    </div>
                    <Input
                      label="Height"
                      type="number"
                      value={targetHeight}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      suffix="px"
                    />
                  </div>
                  <label className={styles.lockLabel}>
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                      className={styles.checkbox}
                    />
                    Lock aspect ratio
                  </label>
                </div>
              )}

              {mode === 'percent' && (
                <div className={styles.percentInput}>
                  <Input
                    label="Scale"
                    type="number"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    suffix="%"
                  />
                  <div className={styles.percentPresets}>
                    {[25, 50, 75, 100, 150, 200].map((p) => (
                      <button
                        key={p}
                        className={`${styles.percentBtn} ${percent === String(p) ? styles.percentBtnActive : ''}`}
                        onClick={() => setPercent(String(p))}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'preset' && (
                <div className={styles.presetGrid}>
                  {PRESETS.map((p, i) => (
                    <button
                      key={p.label}
                      className={`${styles.presetBtn} ${activePreset === i ? styles.presetBtnActive : ''}`}
                      onClick={() => handlePresetClick(i)}
                    >
                      <span className={styles.presetLabel}>{p.label}</span>
                      <span className={styles.presetDims}>{p.w} x {p.h}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Output Settings */}
            <Card variant="glass">
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>&#128190;</span>
                <span>Output Format</span>
              </div>
              <SegmentedControl
                options={FORMAT_OPTIONS}
                value={format}
                onChange={(v) => setFormat(v as OutputFormat)}
              />
              {showQuality && (
                <div className={styles.qualitySection}>
                  <div className={styles.qualityHeader}>
                    <span className={styles.qualityLabel}>Quality</span>
                    <span className={styles.qualityValue}>{quality}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value))}
                    className={styles.qualitySlider}
                  />
                  <div className={styles.qualityMarks}>
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Size Comparison */}
            {outputDims && (
              <Card variant="glass" className={styles.comparisonCard}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionIcon}>&#128200;</span>
                  <span>Size Comparison</span>
                </div>
                <div className={styles.comparison}>
                  <div className={styles.compItem}>
                    <span className={styles.compLabel}>Original</span>
                    <span className={styles.compDims}>{currentImage!.width} x {currentImage!.height}</span>
                    <span className={styles.compSize}>{formatBytes(currentImage!.file.size)}</span>
                  </div>
                  <div className={styles.compArrow}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                  <div className={styles.compItem}>
                    <span className={styles.compLabel}>Resized</span>
                    <span className={styles.compDims}>{outputDims.w} x {outputDims.h}</span>
                    <span className={styles.compSize}>
                      {estimatedSize !== null ? formatBytes(estimatedSize) : 'Calculating...'}
                    </span>
                  </div>
                </div>
                {estimatedSize !== null && currentImage && (
                  <div className={styles.savings}>
                    {estimatedSize < currentImage.file.size ? (
                      <span className={styles.savingsGood}>
                        {Math.round((1 - estimatedSize / currentImage.file.size) * 100)}% smaller
                      </span>
                    ) : (
                      <span className={styles.savingsWarn}>
                        {Math.round((estimatedSize / currentImage.file.size - 1) * 100)}% larger
                      </span>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Download */}
            <div className={styles.downloadSection}>
              {processing && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${batchProgress}%` }} />
                </div>
              )}
              <Button
                variant="gradient"
                onClick={handleDownload}
                disabled={!outputDims || processing}
                haptic
                className={styles.downloadBtn}
              >
                {processing
                  ? `Processing... ${batchProgress}%`
                  : downloadReady
                    ? 'Download Again'
                    : images.length > 1
                      ? `Resize & Download ${images.length} Images`
                      : 'Resize & Download'
                }
              </Button>
              <button
                className={styles.addMoreBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                + Add more images
              </button>
            </div>
          </>
        )}
      </div>

      <AdBanner position="inline" />
      {showPaywall && <PaywallPrompt onDismiss={dismissPaywall} />}
    </Layout>
  );
}
