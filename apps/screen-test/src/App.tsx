import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

interface DevicePreset {
  name: string;
  category: string;
  width: number;
  height: number;
}

const DEVICE_PRESETS: DevicePreset[] = [
  { name: 'iPhone SE', category: 'Phone', width: 375, height: 667 },
  { name: 'iPhone 14', category: 'Phone', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max', category: 'Phone', width: 430, height: 932 },
  { name: 'Galaxy S23', category: 'Phone', width: 360, height: 780 },
  { name: 'Pixel 7', category: 'Phone', width: 412, height: 915 },
  { name: 'iPad Mini', category: 'Tablet', width: 768, height: 1024 },
  { name: 'iPad Air', category: 'Tablet', width: 820, height: 1180 },
  { name: 'iPad Pro 12.9"', category: 'Tablet', width: 1024, height: 1366 },
  { name: 'Galaxy Tab S8', category: 'Tablet', width: 800, height: 1280 },
  { name: 'Laptop 13"', category: 'Desktop', width: 1280, height: 800 },
  { name: 'Laptop 15"', category: 'Desktop', width: 1440, height: 900 },
  { name: 'Desktop HD', category: 'Desktop', width: 1920, height: 1080 },
  { name: 'Desktop QHD', category: 'Desktop', width: 2560, height: 1440 },
  { name: 'Desktop 4K', category: 'Desktop', width: 3840, height: 2160 },
];

interface Breakpoint {
  name: string;
  min: number;
  max: number;
  color: string;
}

const BREAKPOINTS: Breakpoint[] = [
  { name: 'xs', min: 0, max: 575, color: '#ff3b30' },
  { name: 'sm', min: 576, max: 767, color: '#ff9500' },
  { name: 'md', min: 768, max: 991, color: '#ffcc00' },
  { name: 'lg', min: 992, max: 1199, color: '#34c759' },
  { name: 'xl', min: 1200, max: 1399, color: '#0a84ff' },
  { name: 'xxl', min: 1400, max: Infinity, color: '#af52de' },
];

function getBreakpoint(width: number): Breakpoint {
  return BREAKPOINTS.find(bp => width >= bp.min && width <= bp.max) || BREAKPOINTS[0];
}

type TestPattern = 'grid' | 'bars';

export default function App() {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [categoryFilter, setCategoryFilter] = useState<string>('Phone');
  const [showTestPattern, setShowTestPattern] = useState(false);
  const [testPattern, setTestPattern] = useState<TestPattern>('grid');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const screenInfo = useMemo(() => ({
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    devicePixelRatio: window.devicePixelRatio,
    colorDepth: window.screen.colorDepth,
  }), [viewport]);

  const currentBreakpoint = useMemo(() => getBreakpoint(viewport.width), [viewport.width]);

  const filteredPresets = useMemo(
    () => DEVICE_PRESETS.filter(p => p.category === categoryFilter),
    [categoryFilter]
  );

  const presetDimensions = useMemo(() => {
    if (selectedPreset === null) return null;
    const preset = DEVICE_PRESETS[selectedPreset];
    if (orientation === 'landscape') {
      return { width: preset.height, height: preset.width };
    }
    return { width: preset.width, height: preset.height };
  }, [selectedPreset, orientation]);

  const previewStyle = useMemo(() => {
    if (!presetDimensions) return null;
    const maxW = 300;
    const maxH = 220;
    const scale = Math.min(maxW / presetDimensions.width, maxH / presetDimensions.height);
    return {
      width: Math.max(presetDimensions.width * scale, 30),
      height: Math.max(presetDimensions.height * scale, 30),
    };
  }, [presetDimensions]);

  const handleCopy = useCallback(() => {
    const info = [
      `Screen: ${screenInfo.screenWidth} × ${screenInfo.screenHeight}`,
      `Viewport: ${screenInfo.viewportWidth} × ${screenInfo.viewportHeight}`,
      `Device Pixel Ratio: ${screenInfo.devicePixelRatio}`,
      `Color Depth: ${screenInfo.colorDepth}-bit`,
      `Breakpoint: ${currentBreakpoint.name}`,
    ].join('\n');
    navigator.clipboard.writeText(info);
    setCopied(true);
    trackEvent('screen_test_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [screenInfo, currentBreakpoint]);

  const handlePresetSelect = (globalIndex: number) => {
    setSelectedPreset(globalIndex);
    trackEvent('screen_test_preset', { device: DEVICE_PRESETS[globalIndex].name });
  };

  const handleTestPattern = () => {
    setShowTestPattern(true);
    trackEvent('screen_test_pattern', { pattern: testPattern });
  };

  useEffect(() => {
    if (!showTestPattern) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTestPattern(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showTestPattern]);

  if (showTestPattern) {
    return (
      <div className={styles.testPatternOverlay} onClick={() => setShowTestPattern(false)}>
        {testPattern === 'grid' ? (
          <div className={styles.gridPattern}>
            <div className={styles.gridInfo}>
              {viewport.width} × {viewport.height}
            </div>
            <div className={styles.gridCenter}>
              <div className={styles.crosshair} />
            </div>
          </div>
        ) : (
          <div className={styles.colorBars}>
            {['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'].map(
              (color) => (
                <div key={color} className={styles.colorBar} style={{ backgroundColor: color }} />
              )
            )}
            <div className={styles.gridInfo}>
              {viewport.width} × {viewport.height}
            </div>
          </div>
        )}
        <div className={styles.testPatternHint}>Click or press Esc to exit</div>
      </div>
    );
  }

  return (
    <Layout title="Screen Resolution Tester">
      <div className={styles.container}>
        {/* Current Screen Info */}
        <Card variant="glass">
          <div className={styles.sectionLabel}>Your Display</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Screen</span>
              <span className={styles.infoValue}>
                {screenInfo.screenWidth} × {screenInfo.screenHeight}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Viewport</span>
              <span className={styles.infoValue}>
                {screenInfo.viewportWidth} × {screenInfo.viewportHeight}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Pixel Ratio</span>
              <span className={styles.infoValue}>{screenInfo.devicePixelRatio}x</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Color Depth</span>
              <span className={styles.infoValue}>{screenInfo.colorDepth}-bit</span>
            </div>
          </div>
        </Card>

        {/* Breakpoint Indicator */}
        <Card>
          <div className={styles.sectionLabel}>CSS Breakpoint</div>
          <div className={styles.breakpointBar}>
            {BREAKPOINTS.map((bp) => (
              <div
                key={bp.name}
                className={`${styles.breakpointSegment} ${bp.name === currentBreakpoint.name ? styles.breakpointActive : ''}`}
                style={{
                  '--bp-color': bp.color,
                } as React.CSSProperties}
              >
                <span className={styles.breakpointName}>{bp.name}</span>
                <span className={styles.breakpointRange}>
                  {bp.max === Infinity ? `${bp.min}+` : `${bp.min}-${bp.max}`}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.breakpointCurrent} style={{ color: currentBreakpoint.color }}>
            Current: <strong>{currentBreakpoint.name}</strong> ({viewport.width}px)
          </div>
        </Card>

        {/* Device Presets */}
        <Card>
          <div className={styles.sectionLabel}>Device Simulator</div>
          <SegmentedControl
            options={[
              { label: 'Phone', value: 'Phone' },
              { label: 'Tablet', value: 'Tablet' },
              { label: 'Desktop', value: 'Desktop' },
            ]}
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              setSelectedPreset(null);
            }}
          />
          <div className={styles.presetList}>
            {filteredPresets.map((preset) => {
              const globalIdx = DEVICE_PRESETS.indexOf(preset);
              const isActive = selectedPreset === globalIdx;
              const pw = orientation === 'landscape' ? preset.height : preset.width;
              const ph = orientation === 'landscape' ? preset.width : preset.height;
              return (
                <button
                  key={preset.name}
                  className={`${styles.presetBtn} ${isActive ? styles.presetActive : ''}`}
                  onClick={() => handlePresetSelect(globalIdx)}
                >
                  <span className={styles.presetName}>{preset.name}</span>
                  <span className={styles.presetSize}>{pw} × {ph}</span>
                </button>
              );
            })}
          </div>
          {categoryFilter !== 'Desktop' && (
            <div className={styles.orientationRow}>
              <SegmentedControl
                options={[
                  { label: 'Portrait', value: 'portrait' as const },
                  { label: 'Landscape', value: 'landscape' as const },
                ]}
                value={orientation}
                onChange={setOrientation}
              />
            </div>
          )}
        </Card>

        {/* Preview Frame */}
        {presetDimensions && previewStyle && (
          <Card variant="glass">
            <div className={styles.sectionLabel}>Preview</div>
            <div className={styles.previewContainer}>
              <div className={styles.previewFrame} style={previewStyle}>
                <div className={styles.previewInner}>
                  <div className={styles.previewDims}>
                    {presetDimensions.width} × {presetDimensions.height}
                  </div>
                  <div className={styles.previewDevice}>
                    {DEVICE_PRESETS[selectedPreset!].name}
                  </div>
                </div>
                <div className={styles.corner} style={{ top: -2, left: -2 }} />
                <div className={styles.corner} style={{ top: -2, right: -2 }} />
                <div className={styles.corner} style={{ bottom: -2, left: -2 }} />
                <div className={styles.corner} style={{ bottom: -2, right: -2 }} />
              </div>
            </div>
          </Card>
        )}

        {/* Test Pattern */}
        <Card>
          <div className={styles.sectionLabel}>Full-Screen Test</div>
          <div className={styles.testPatternRow}>
            <SegmentedControl
              options={[
                { label: 'Grid', value: 'grid' as TestPattern },
                { label: 'Color Bars', value: 'bars' as TestPattern },
              ]}
              value={testPattern}
              onChange={setTestPattern}
            />
            <Button variant="gradient" onClick={handleTestPattern} haptic>
              Launch Test
            </Button>
          </div>
        </Card>

        {/* Copy Button */}
        <Button variant="shimmer" onClick={handleCopy} haptic>
          {copied ? '✓ Copied' : 'Copy Resolution Info'}
        </Button>
      </div>
    </Layout>
  );
}
