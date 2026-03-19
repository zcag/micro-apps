import { useState, useCallback } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  ResultDisplay,
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
  costExact: number | null;
  costWithWaste: number | null;
}

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

  // Room area in base unit (sq ft or sq m)
  const roomArea = rL * rW;

  // Convert tile dimensions to the same unit as room
  // Imperial: room in ft, tile in inches, grout in inches
  // Metric: room in m, tile in cm, grout in mm
  let effectiveTileW: number;
  let effectiveTileH: number;

  if (unit === 'imperial') {
    // tile inches -> feet, grout inches -> feet
    effectiveTileW = (tW + gap) / 12;
    effectiveTileH = (tH + gap) / 12;
  } else {
    // tile cm -> m, grout mm -> cm -> m
    effectiveTileW = (tW + gap / 10) / 100;
    effectiveTileH = (tH + gap / 10) / 100;
  }

  const effectiveTileArea = effectiveTileW * effectiveTileH;
  if (effectiveTileArea <= 0) return null;

  const tilesExact = Math.ceil(roomArea / effectiveTileArea);
  const tilesWithWaste = Math.ceil(tilesExact * 1.1);

  const price = parseFloat(pricePerTile);
  const costExact = !isNaN(price) && price > 0 ? tilesExact * price : null;
  const costWithWaste = !isNaN(price) && price > 0 ? tilesWithWaste * price : null;

  return { roomArea, tilesExact, tilesWithWaste, costExact, costWithWaste };
}

function TilePreview({
  room,
  tile,
  groutGap,
  unit,
}: {
  room: RoomDims;
  tile: TileDims;
  groutGap: string;
  unit: UnitSystem;
}) {
  const rL = parseFloat(room.length);
  const rW = parseFloat(room.width);
  const tW = parseFloat(tile.width);
  const tH = parseFloat(tile.height);
  const gap = parseFloat(groutGap) || 0;

  if (isNaN(rL) || isNaN(rW) || isNaN(tW) || isNaN(tH)) return null;
  if (rL <= 0 || rW <= 0 || tW <= 0 || tH <= 0) return null;

  // Convert everything to room units for proportional rendering
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

  // Limit rendering for performance
  const maxCols = Math.min(cols, 50);
  const maxRows = Math.min(rows, 50);

  // Scale to fit preview area
  const previewSize = 300;
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
    <div className={styles.previewContainer}>
      <div
        className={styles.previewGrid}
        style={{
          width: pxW,
          height: pxH,
          gridTemplateColumns: `repeat(${maxCols}, 1fr)`,
          gridTemplateRows: `repeat(${maxRows}, 1fr)`,
          gap: `${gapPx}px`,
        }}
      >
        {Array.from({ length: maxRows * maxCols }, (_, i) => (
          <div key={i} className={styles.previewTile} />
        ))}
      </div>
      <span className={styles.previewLabel}>
        {cols} x {rows} tiles
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

  const handleCalculate = useCallback(() => {
    const r = calculate(room, tile, groutGap, unit, pricePerTile);
    setResults(r);
    if (r) {
      trackEvent('calculate', { unit });
    }
  }, [room, tile, groutGap, unit, pricePerTile]);

  const roomSuffix = unit === 'imperial' ? 'ft' : 'm';
  const tileSuffix = unit === 'imperial' ? 'in' : 'cm';
  const groutSuffix = unit === 'imperial' ? 'in' : 'mm';
  const areaSuffix = unit === 'imperial' ? 'sq ft' : 'sq m';

  const formatCurrency = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <Layout title="Tile Calculator">
      <div className={styles.container}>
        <Card>
          <div className={styles.section}>
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

          <h3 className={styles.heading}>Room Dimensions</h3>
          <div className={styles.inputs}>
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
        </Card>

        <Card style={{ marginTop: '16px' }}>
          <h3 className={styles.heading}>Tile Dimensions</h3>
          <div className={styles.inputs}>
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
        </Card>

        <Card style={{ marginTop: '16px' }}>
          <h3 className={styles.heading}>Cost Estimate (Optional)</h3>
          <div className={styles.inputs}>
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
        </Card>

        <div className={styles.buttonRow}>
          <Button onClick={handleCalculate} haptic>
            Calculate
          </Button>
        </div>

        {results && (
          <Card style={{ marginTop: '16px' }}>
            <h3 className={styles.heading}>Results</h3>
            <div className={styles.results}>
              <ResultDisplay
                label="Room Area"
                value={results.roomArea.toFixed(2)}
                unit={areaSuffix}
              />
              <ResultDisplay
                label="Tiles Needed (exact)"
                value={results.tilesExact}
                unit="tiles"
              />
              <ResultDisplay
                label="Tiles Recommended (10% waste)"
                value={results.tilesWithWaste}
                unit="tiles"
              />
              {results.costExact !== null && (
                <>
                  <ResultDisplay
                    label="Cost (exact)"
                    value={formatCurrency(results.costExact)}
                  />
                  <ResultDisplay
                    label="Cost (with waste)"
                    value={formatCurrency(results.costWithWaste!)}
                  />
                </>
              )}
            </div>
          </Card>
        )}

        <Card style={{ marginTop: '16px' }}>
          <h3 className={styles.heading}>Visual Preview</h3>
          <TilePreview room={room} tile={tile} groutGap={groutGap} unit={unit} />
        </Card>
      </div>
    </Layout>
  );
}
