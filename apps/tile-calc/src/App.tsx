import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  SegmentedControl,
  trackEvent,
} from '@micro-apps/shared';
import styles from './App.module.css';

type UnitSystem = 'imperial' | 'metric';

interface RoomDims {
  length: string;
  width: string;
}

interface TileDims {
  width: string;
  height: string;
}

interface Results {
  roomArea: number;
  tilesExact: number;
  tilesWithWaste: number;
  wasteTiles: number;
  costExact: number | null;
  costWithWaste: number | null;
  costPerSqFt: number | null;
}

const TILE_COLORS = [
  { name: 'White', value: '#f0eeeb' },
  { name: 'Gray', value: '#9e9e9e' },
  { name: 'Beige', value: '#d4c5a9' },
  { name: 'Terracotta', value: '#c75b39' },
  { name: 'Navy', value: '#2c3e6b' },
  { name: 'Forest', value: '#3a6b4a' },
  { name: 'Black', value: '#2d2d2d' },
];

const GROUT_COLORS = [
  { name: 'White', value: '#e8e6e1' },
  { name: 'Gray', value: '#8a8a8a' },
  { name: 'Charcoal', value: '#3d3d3d' },
];

const ROOM_PRESETS = [
  { label: 'Bathroom', emoji: '🚿', dims: { length: '5', width: '8' } },
  { label: 'Kitchen', emoji: '🍳', dims: { length: '10', width: '12' } },
  { label: 'Laundry', emoji: '🧺', dims: { length: '6', width: '8' } },
  { label: 'Entryway', emoji: '🚪', dims: { length: '4', width: '6' } },
];

function calculate(
  room: RoomDims,
  tile: TileDims,
  groutGap: string,
  unit: UnitSystem,
  pricePerTile: string
): Results | null {
  const rL = parseFloat(room.length);
  const rW = parseFloat(room.width);
  const tW = parseFloat(tile.width);
  const tH = parseFloat(tile.height);
  const gap = parseFloat(groutGap) || 0;

  if (isNaN(rL) || isNaN(rW) || isNaN(tW) || isNaN(tH)) return null;
  if (rL <= 0 || rW <= 0 || tW <= 0 || tH <= 0 || gap < 0) return null;

  const roomArea = rL * rW;

  let effectiveTileW: number;
  let effectiveTileH: number;

  if (unit === 'imperial') {
    effectiveTileW = (tW + gap) / 12;
    effectiveTileH = (tH + gap) / 12;
  } else {
    effectiveTileW = (tW + gap / 10) / 100;
    effectiveTileH = (tH + gap / 10) / 100;
  }

  const effectiveTileArea = effectiveTileW * effectiveTileH;
  if (effectiveTileArea <= 0) return null;

  const tilesExact = Math.ceil(roomArea / effectiveTileArea);
  const tilesWithWaste = Math.ceil(tilesExact * 1.1);
  const wasteTiles = tilesWithWaste - tilesExact;

  const price = parseFloat(pricePerTile);
  const costExact = !isNaN(price) && price > 0 ? tilesExact * price : null;
  const costWithWaste = !isNaN(price) && price > 0 ? tilesWithWaste * price : null;
  const costPerSqFt = costWithWaste !== null && roomArea > 0 ? costWithWaste / roomArea : null;

  return { roomArea, tilesExact, tilesWithWaste, wasteTiles, costExact, costWithWaste, costPerSqFt };
}

/** Animated count-up hook */
function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) {
      setDisplay(target);
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

function AnimatedValue({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const animated = useCountUp(value);
  return <>{animated.toFixed(decimals)}</>;
}

function AnimatedInt({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{Math.round(animated)}</>;
}

function ColorPalette({
  colors,
  selected,
  onChange,
  label,
}: {
  colors: { name: string; value: string }[];
  selected: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className={styles.colorPalette}>
      <span className={styles.colorPaletteLabel}>{label}</span>
      <div className={styles.colorSwatches}>
        {colors.map((c) => (
          <button
            key={c.value}
            className={`${styles.colorSwatch} ${selected === c.value ? styles.colorSwatchActive : ''}`}
            style={{ backgroundColor: c.value }}
            onClick={() => onChange(c.value)}
            title={c.name}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

function TilePreview({
  room,
  tile,
  groutGap,
  unit,
  tileColor,
  groutColor,
}: {
  room: RoomDims;
  tile: TileDims;
  groutGap: string;
  unit: UnitSystem;
  tileColor: string;
  groutColor: string;
}) {
  const rL = parseFloat(room.length);
  const rW = parseFloat(room.width);
  const tW = parseFloat(tile.width);
  const tH = parseFloat(tile.height);
  const gap = parseFloat(groutGap) || 0;

  if (isNaN(rL) || isNaN(rW) || isNaN(tW) || isNaN(tH)) return null;
  if (rL <= 0 || rW <= 0 || tW <= 0 || tH <= 0) return null;

  let tileFracW: number;
  let tileFracH: number;
  let gapFrac: number;

  if (unit === 'imperial') {
    tileFracW = tW / 12;
    tileFracH = tH / 12;
    gapFrac = gap / 12;
  } else {
    tileFracW = tW / 100;
    tileFracH = tH / 100;
    gapFrac = gap / 1000;
  }

  const effectiveW = tileFracW + gapFrac;
  const effectiveH = tileFracH + gapFrac;

  const cols = Math.ceil(rL / effectiveW);
  const rows = Math.ceil(rW / effectiveH);

  const maxCols = Math.min(cols, 50);
  const maxRows = Math.min(rows, 50);

  const previewSize = 400;
  const roomAspect = rL / rW;
  let pxW: number;
  let pxH: number;
  if (roomAspect >= 1) {
    pxW = previewSize;
    pxH = previewSize / roomAspect;
  } else {
    pxH = previewSize;
    pxW = previewSize * roomAspect;
  }

  const cellW = pxW / maxCols;
  const gapPx = Math.max(1, Math.min(3, (gapFrac / effectiveW) * cellW));

  return (
    <div className={styles.previewFrame}>
      {/* Room outline frame */}
      <div className={styles.previewRoomFrame}>
        {/* Ruler along top */}
        <div className={styles.previewRulerTop} style={{ width: pxW }}>
          <span className={styles.previewRulerLabel}>
            {rL} {unit === 'imperial' ? 'ft' : 'm'}
          </span>
        </div>
        {/* Ruler along side */}
        <div className={styles.previewRulerSide} style={{ height: pxH }}>
          <span className={styles.previewRulerLabel}>
            {rW} {unit === 'imperial' ? 'ft' : 'm'}
          </span>
        </div>
        <div
          className={styles.previewGrid}
          style={{
            width: pxW,
            height: pxH,
            gridTemplateColumns: `repeat(${maxCols}, 1fr)`,
            gridTemplateRows: `repeat(${maxRows}, 1fr)`,
            gap: `${gapPx}px`,
            backgroundColor: groutColor,
          }}
        >
          {Array.from({ length: maxRows * maxCols }, (_, i) => (
            <div
              key={i}
              className={styles.previewTile}
              style={{ backgroundColor: tileColor }}
            />
          ))}
        </div>
      </div>
      <span className={styles.previewLabel}>
        {cols} × {rows} tiles
        {(cols > 50 || rows > 50) && (
          <span className={styles.previewLabelNote}> (preview scaled down)</span>
        )}
      </span>
    </div>
  );
}

export default function App() {
  const [unit, setUnit] = useState<UnitSystem>('imperial');
  const [room, setRoom] = useState<RoomDims>({ length: '', width: '' });
  const [tile, setTile] = useState<TileDims>({ width: '', height: '' });
  const [groutGap, setGroutGap] = useState('');
  const [pricePerTile, setPricePerTile] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [tileColor, setTileColor] = useState(TILE_COLORS[0].value);
  const [groutColor, setGroutColor] = useState(GROUT_COLORS[0].value);
  const [copied, setCopied] = useState(false);

  const handleCalculate = useCallback(() => {
    const r = calculate(room, tile, groutGap, unit, pricePerTile);
    setResults(r);
    if (r) {
      trackEvent('calculate', { unit });
    }
  }, [room, tile, groutGap, unit, pricePerTile]);

  const handlePreset = (preset: (typeof ROOM_PRESETS)[number]) => {
    setUnit('imperial');
    setRoom(preset.dims);
    setResults(null);
  };

  const handleCopyAll = () => {
    if (!results) return;
    const lines = [
      `Room Area: ${results.roomArea.toFixed(2)} ${unit === 'imperial' ? 'sq ft' : 'sq m'}`,
      `Tiles Needed: ${results.tilesExact}`,
      `Tiles w/ Waste: ${results.tilesWithWaste} (+${results.wasteTiles})`,
      results.costWithWaste !== null ? `Total Cost: $${results.costWithWaste.toFixed(2)}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const roomSuffix = unit === 'imperial' ? 'ft' : 'm';
  const tileSuffix = unit === 'imperial' ? 'in' : 'cm';
  const groutSuffix = unit === 'imperial' ? 'in' : 'mm';
  const areaSuffix = unit === 'imperial' ? 'sq ft' : 'sq m';

  const formatCurrency = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const hasValidRoom = room.length && room.width &&
    parseFloat(room.length) > 0 && parseFloat(room.width) > 0;
  const hasValidTile = tile.width && tile.height &&
    parseFloat(tile.width) > 0 && parseFloat(tile.height) > 0;
  const hasPreview = hasValidRoom && hasValidTile;

  return (
    <Layout title="Tile Calculator">
      <div className={styles.container}>
        {/* Tile Preview — Hero Visual */}
        <div className={styles.previewSection}>
          <Card>
            <div className={styles.previewHeader}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>🔲</span>
                <span>Tile Preview</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.colorControls}>
                <ColorPalette
                  colors={TILE_COLORS}
                  selected={tileColor}
                  onChange={setTileColor}
                  label="Tile"
                />
                <ColorPalette
                  colors={GROUT_COLORS}
                  selected={groutColor}
                  onChange={setGroutColor}
                  label="Grout"
                />
              </div>
            </div>
            <div className={styles.previewContainer}>
              {hasPreview ? (
                <TilePreview
                  room={room}
                  tile={tile}
                  groutGap={groutGap}
                  unit={unit}
                  tileColor={tileColor}
                  groutColor={groutColor}
                />
              ) : (
                <div className={styles.emptyPreview}>
                  <div className={styles.emptyPreviewIcon}>⬜</div>
                  <div className={styles.emptyPreviewRoom}>
                    <div className={styles.emptyRoomOutline}>
                      <span className={styles.emptyRoomLabel}>Enter room dimensions</span>
                    </div>
                  </div>
                  <div className={styles.emptyPreviewHint}>
                    Set room &amp; tile sizes to see the layout
                  </div>
                </div>
              )}
            </div>
            {/* Pattern note */}
            <div className={styles.patternNote}>
              Pattern: Standard Grid
              <span className={styles.patternNoteFuture}>· Brick &amp; Diagonal coming soon</span>
            </div>
          </Card>
        </div>

        {/* Input Section */}
        <div className={styles.heroSection}>
          <Card>
            <div className={styles.unitSection}>
              <SegmentedControl
                options={[
                  { label: 'Imperial (ft/in)', value: 'imperial' },
                  { label: 'Metric (m/cm)', value: 'metric' },
                ]}
                value={unit}
                onChange={(v) => {
                  setUnit(v);
                  setResults(null);
                }}
              />
            </div>

            {/* Room presets */}
            <div className={styles.presetSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionHeaderIcon}>🏠</span>
                <span>Room Presets</span>
                <span className={styles.sectionDivider} />
              </div>
              <div className={styles.presetChips}>
                {ROOM_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={styles.presetChip}
                    onClick={() => handlePreset(p)}
                    type="button"
                  >
                    <span className={styles.presetEmoji}>{p.emoji}</span>
                    {p.label}
                    <span className={styles.presetDims}>
                      {p.dims.length}×{p.dims.width}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Room dimensions group */}
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                📐 Room Dimensions
              </div>
              <div className={styles.inputGroupFields}>
                <Input
                  label="Length"
                  suffix={roomSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={room.length}
                  onChange={(e) => setRoom({ ...room, length: e.target.value })}
                />
                <span className={styles.inputConnector}>×</span>
                <Input
                  label="Width"
                  suffix={roomSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={room.width}
                  onChange={(e) => setRoom({ ...room, width: e.target.value })}
                />
              </div>
            </div>

            {/* Tile settings group */}
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                🔷 Tile Settings
              </div>
              <div className={styles.inputGroupFields}>
                <Input
                  label="Tile Width"
                  suffix={tileSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={tile.width}
                  onChange={(e) => setTile({ ...tile, width: e.target.value })}
                />
                <span className={styles.inputConnector}>×</span>
                <Input
                  label="Tile Height"
                  suffix={tileSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={tile.height}
                  onChange={(e) => setTile({ ...tile, height: e.target.value })}
                />
              </div>
              <div className={styles.inputGroupFieldsSingle}>
                <Input
                  label="Grout Gap"
                  suffix={groutSuffix}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={groutGap}
                  onChange={(e) => setGroutGap(e.target.value)}
                />
              </div>
            </div>

            {/* Cost estimate */}
            <div className={styles.inputGroup}>
              <div className={styles.inputGroupLabel}>
                💰 Cost Estimate
                <span className={styles.inputGroupOptional}>Optional</span>
              </div>
              <div className={styles.inputGroupFieldsSingle}>
                <Input
                  label="Price per Tile"
                  suffix="$"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={pricePerTile}
                  onChange={(e) => setPricePerTile(e.target.value)}
                />
              </div>
            </div>

            {hasValidRoom && hasValidTile && !results && (
              <div className={styles.validIndicator}>
                ✓ Ready to calculate
              </div>
            )}

            <div className={styles.calculateArea}>
              <Button variant="gradient" onClick={handleCalculate} haptic>
                Calculate Tiles
              </Button>
            </div>
          </Card>
        </div>

        {/* Results */}
        {results && (
          <>
            <div className={styles.resultsDivider}>
              <span className={styles.resultsDividerLine} />
              <span className={styles.resultsDividerIcon}>▼</span>
              <span className={styles.resultsDividerLine} />
            </div>

            <div className={styles.resultsContainer}>
              {/* Primary result — total tiles */}
              <div className={styles.primaryResult}>
                <div className={styles.primaryResultLabel}>Tiles Needed</div>
                <div className={styles.primaryResultValue}>
                  <AnimatedInt value={results.tilesWithWaste} />
                </div>
                <div className={styles.primaryResultUnit}>tiles total</div>
                <div className={styles.wasteBadge}>
                  Includes <AnimatedInt value={results.wasteTiles} /> extra for 10% waste
                </div>
              </div>

              {/* Secondary results grid */}
              <div className={styles.secondaryResults}>
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>📏</div>
                  <div className={styles.secondaryCardValue}>
                    <AnimatedValue value={results.roomArea} />
                  </div>
                  <div className={styles.secondaryCardLabel}>{areaSuffix}</div>
                </div>
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>🔢</div>
                  <div className={styles.secondaryCardValue}>
                    <AnimatedInt value={results.tilesExact} />
                  </div>
                  <div className={styles.secondaryCardLabel}>Exact Tiles</div>
                </div>
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>♻️</div>
                  <div className={styles.secondaryCardValue}>
                    +<AnimatedInt value={results.wasteTiles} />
                  </div>
                  <div className={styles.secondaryCardLabel}>Waste Tiles</div>
                </div>
                <div className={styles.secondaryCard}>
                  <div className={styles.secondaryCardEmoji}>📦</div>
                  <div className={styles.secondaryCardValue}>
                    <AnimatedInt value={results.tilesWithWaste} />
                  </div>
                  <div className={styles.secondaryCardLabel}>Total w/ Waste</div>
                </div>
              </div>

              {/* Cost summary card */}
              {results.costExact !== null && (
                <div className={styles.costCard}>
                  <div className={styles.costCardHeader}>
                    <span className={styles.costCardIcon}>💎</span>
                    <span>Cost Summary</span>
                  </div>
                  <div className={styles.costCardGrid}>
                    <div className={styles.costRow}>
                      <span className={styles.costRowLabel}>Tiles only</span>
                      <span className={styles.costRowValue}>{formatCurrency(results.costExact)}</span>
                    </div>
                    <div className={`${styles.costRow} ${styles.costRowHighlight}`}>
                      <span className={styles.costRowLabel}>With 10% waste</span>
                      <span className={styles.costRowValue}>{formatCurrency(results.costWithWaste!)}</span>
                    </div>
                    {results.costPerSqFt !== null && (
                      <div className={styles.costRow}>
                        <span className={styles.costRowLabel}>Cost per {areaSuffix}</span>
                        <span className={styles.costRowValue}>{formatCurrency(results.costPerSqFt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Copy button */}
              <button
                className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
                onClick={handleCopyAll}
                type="button"
              >
                <span className={styles.copyIcon}>{copied ? '✓' : '📋'}</span>
                {copied ? 'Copied!' : 'Copy All Results'}
              </button>
            </div>
          </>
        )}

        {/* Empty results state */}
        {!results && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🏗️</div>
              <div className={styles.emptyStateText}>Enter dimensions to calculate</div>
              <div className={styles.emptyStateHint}>
                or pick a room preset above to get started
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
