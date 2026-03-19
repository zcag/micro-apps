import { useState, useEffect, useCallback, useRef } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Category = 'length' | 'weight' | 'temperature' | 'volume' | 'speed' | 'area' | 'storage';

interface UnitDef {
  label: string;
  symbol: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

interface RecentConversion {
  category: Category;
  fromUnit: string;
  toUnit: string;
  fromValue: string;
  toValue: string;
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Unit definitions                                                   */
/* ------------------------------------------------------------------ */

const linear = (factor: number): Pick<UnitDef, 'toBase' | 'fromBase'> => ({
  toBase: (v) => v * factor,
  fromBase: (v) => v / factor,
});

const UNITS: Record<Category, Record<string, UnitDef>> = {
  length: {
    mm:  { label: 'Millimeter', symbol: 'mm', ...linear(0.001) },
    cm:  { label: 'Centimeter', symbol: 'cm', ...linear(0.01) },
    m:   { label: 'Meter',      symbol: 'm',  ...linear(1) },
    km:  { label: 'Kilometer',  symbol: 'km', ...linear(1000) },
    in:  { label: 'Inch',       symbol: 'in', ...linear(0.0254) },
    ft:  { label: 'Foot',       symbol: 'ft', ...linear(0.3048) },
    yd:  { label: 'Yard',       symbol: 'yd', ...linear(0.9144) },
    mi:  { label: 'Mile',       symbol: 'mi', ...linear(1609.344) },
  },
  weight: {
    mg:  { label: 'Milligram', symbol: 'mg',  ...linear(0.000001) },
    g:   { label: 'Gram',     symbol: 'g',   ...linear(0.001) },
    kg:  { label: 'Kilogram', symbol: 'kg',  ...linear(1) },
    oz:  { label: 'Ounce',    symbol: 'oz',  ...linear(0.028349523125) },
    lb:  { label: 'Pound',    symbol: 'lb',  ...linear(0.45359237) },
    ton: { label: 'Ton',      symbol: 'ton', ...linear(907.18474) },
  },
  temperature: {
    C: {
      label: 'Celsius',    symbol: '\u00B0C',
      toBase: (v) => v,
      fromBase: (v) => v,
    },
    F: {
      label: 'Fahrenheit', symbol: '\u00B0F',
      toBase: (v) => (v - 32) * 5 / 9,
      fromBase: (v) => v * 9 / 5 + 32,
    },
    K: {
      label: 'Kelvin',     symbol: 'K',
      toBase: (v) => v - 273.15,
      fromBase: (v) => v + 273.15,
    },
  },
  volume: {
    mL:   { label: 'Milliliter',   symbol: 'mL',    ...linear(0.001) },
    L:    { label: 'Liter',        symbol: 'L',     ...linear(1) },
    gal:  { label: 'Gallon',       symbol: 'gal',   ...linear(3.785411784) },
    qt:   { label: 'Quart',        symbol: 'qt',    ...linear(0.946352946) },
    pt:   { label: 'Pint',         symbol: 'pt',    ...linear(0.473176473) },
    cup:  { label: 'Cup',          symbol: 'cup',   ...linear(0.2365882365) },
    floz: { label: 'Fluid Ounce',  symbol: 'fl oz', ...linear(0.0295735295625) },
    tbsp: { label: 'Tablespoon',   symbol: 'tbsp',  ...linear(0.01478676478125) },
    tsp:  { label: 'Teaspoon',     symbol: 'tsp',   ...linear(0.00492892159375) },
  },
  speed: {
    ms:    { label: 'Meters/sec',  symbol: 'm/s',  ...linear(1) },
    kmh:   { label: 'Kilometers/hr', symbol: 'km/h', ...linear(1 / 3.6) },
    mph:   { label: 'Miles/hr',    symbol: 'mph',  ...linear(0.44704) },
    knots: { label: 'Knots',       symbol: 'kn',   ...linear(0.514444) },
  },
  area: {
    mm2:     { label: 'mm\u00B2',      symbol: 'mm\u00B2',     ...linear(0.000001) },
    cm2:     { label: 'cm\u00B2',      symbol: 'cm\u00B2',     ...linear(0.0001) },
    m2:      { label: 'm\u00B2',       symbol: 'm\u00B2',      ...linear(1) },
    km2:     { label: 'km\u00B2',      symbol: 'km\u00B2',     ...linear(1_000_000) },
    in2:     { label: 'in\u00B2',      symbol: 'in\u00B2',     ...linear(0.00064516) },
    ft2:     { label: 'ft\u00B2',      symbol: 'ft\u00B2',     ...linear(0.09290304) },
    yd2:     { label: 'yd\u00B2',      symbol: 'yd\u00B2',     ...linear(0.83612736) },
    acre:    { label: 'Acre',          symbol: 'acre',    ...linear(4046.8564224) },
    hectare: { label: 'Hectare',       symbol: 'ha',      ...linear(10000) },
  },
  storage: {
    B:  { label: 'Byte',     symbol: 'B',  ...linear(1) },
    KB: { label: 'Kilobyte', symbol: 'KB', ...linear(1024) },
    MB: { label: 'Megabyte', symbol: 'MB', ...linear(1024 ** 2) },
    GB: { label: 'Gigabyte', symbol: 'GB', ...linear(1024 ** 3) },
    TB: { label: 'Terabyte', symbol: 'TB', ...linear(1024 ** 4) },
    PB: { label: 'Petabyte', symbol: 'PB', ...linear(1024 ** 5) },
  },
};

const CATEGORY_OPTIONS: { label: string; value: Category }[] = [
  { label: 'Length',  value: 'length' },
  { label: 'Weight',  value: 'weight' },
  { label: 'Temp',    value: 'temperature' },
  { label: 'Volume',  value: 'volume' },
  { label: 'Speed',   value: 'speed' },
  { label: 'Area',    value: 'area' },
  { label: 'Storage', value: 'storage' },
];

const CATEGORY_DEFAULTS: Record<Category, [string, string]> = {
  length:      ['km', 'mi'],
  weight:      ['kg', 'lb'],
  temperature: ['C', 'F'],
  volume:      ['L', 'gal'],
  speed:       ['kmh', 'mph'],
  area:        ['m2', 'ft2'],
  storage:     ['MB', 'GB'],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FAVORITES_KEY = 'unit-converter-favorites';
const RECENTS_KEY = 'unit-converter-recents';
const MAX_RECENTS = 10;

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function loadRecents(): RecentConversion[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(entry: RecentConversion) {
  const recents = loadRecents();
  recents.unshift(entry);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

function favKey(category: Category, from: string, to: string) {
  return `${category}:${from}:${to}`;
}

function formatNumber(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) return n.toExponential(4);
  if (abs >= 1) return parseFloat(n.toFixed(6)).toString();
  if (abs >= 0.001) return parseFloat(n.toFixed(8)).toString();
  return n.toExponential(4);
}

function getFormula(category: Category, fromKey: string, toKey: string): string {
  const from = UNITS[category][fromKey];
  const to = UNITS[category][toKey];
  if (!from || !to) return '';

  if (category === 'temperature') {
    if (fromKey === 'C' && toKey === 'F') return '\u00B0F = \u00B0C \u00D7 9/5 + 32';
    if (fromKey === 'F' && toKey === 'C') return '\u00B0C = (\u00B0F \u2212 32) \u00D7 5/9';
    if (fromKey === 'C' && toKey === 'K') return 'K = \u00B0C + 273.15';
    if (fromKey === 'K' && toKey === 'C') return '\u00B0C = K \u2212 273.15';
    if (fromKey === 'F' && toKey === 'K') return 'K = (\u00B0F \u2212 32) \u00D7 5/9 + 273.15';
    if (fromKey === 'K' && toKey === 'F') return '\u00B0F = (K \u2212 273.15) \u00D7 9/5 + 32';
    return '';
  }

  const ratio = to.fromBase(from.toBase(1));
  return `1 ${from.symbol} = ${formatNumber(ratio)} ${to.symbol}`;
}

function convert(category: Category, fromKey: string, toKey: string, value: number): number {
  if (fromKey === toKey) return value;
  const from = UNITS[category][fromKey];
  const to = UNITS[category][toKey];
  const base = from.toBase(value);
  return to.fromBase(base);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function App() {
  const [category, setCategory] = useState<Category>('length');
  const [fromUnit, setFromUnit] = useState(CATEGORY_DEFAULTS.length[0]);
  const [toUnit, setToUnit] = useState(CATEGORY_DEFAULTS.length[1]);
  const [fromValue, setFromValue] = useState('1');
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [recents, setRecents] = useState<RecentConversion[]>(loadRecents);
  const [copied, setCopied] = useState(false);
  const [showRecents, setShowRecents] = useState(false);
  const fromInputRef = useRef<HTMLInputElement>(null);

  const units = UNITS[category];
  const unitKeys = Object.keys(units);
  const numericValue = parseFloat(fromValue) || 0;
  const result = convert(category, fromUnit, toUnit, numericValue);
  const resultStr = formatNumber(result);
  const formula = getFormula(category, fromUnit, toUnit);
  const currentFavKey = favKey(category, fromUnit, toUnit);
  const isFavorite = favorites.includes(currentFavKey);

  // When category changes, reset to defaults
  useEffect(() => {
    const [defaultFrom, defaultTo] = CATEGORY_DEFAULTS[category];
    setFromUnit(defaultFrom);
    setToUnit(defaultTo);
    setFromValue('1');
  }, [category]);

  // Save recent on meaningful conversions (debounced)
  const saveRecentRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!fromValue || numericValue === 0) return;
    clearTimeout(saveRecentRef.current);
    saveRecentRef.current = setTimeout(() => {
      saveRecent({
        category,
        fromUnit,
        toUnit,
        fromValue,
        toValue: resultStr,
        timestamp: Date.now(),
      });
      setRecents(loadRecents());
    }, 1000);
    return () => clearTimeout(saveRecentRef.current);
  }, [fromValue, fromUnit, toUnit, category, numericValue, resultStr]);

  const handleSwap = useCallback(() => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
    setFromValue(resultStr);
    trackEvent('unit_swap');
  }, [fromUnit, toUnit, resultStr]);

  const handleCopy = useCallback(() => {
    const text = `${resultStr} ${units[toUnit].symbol}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
    trackEvent('copy_result');
  }, [resultStr, toUnit, units]);

  const toggleFavorite = useCallback(() => {
    setFavorites((prev) => {
      const next = prev.includes(currentFavKey)
        ? prev.filter((k) => k !== currentFavKey)
        : [...prev, currentFavKey];
      saveFavorites(next);
      return next;
    });
    trackEvent('toggle_favorite');
  }, [currentFavKey]);

  const loadFavoriteConversion = useCallback((key: string) => {
    const [cat, from, to] = key.split(':') as [Category, string, string];
    if (UNITS[cat] && UNITS[cat][from] && UNITS[cat][to]) {
      setCategory(cat);
      setFromUnit(from);
      setToUnit(to);
      setFromValue('1');
    }
  }, []);

  const loadRecentConversion = useCallback((r: RecentConversion) => {
    setCategory(r.category);
    setFromUnit(r.fromUnit);
    setToUnit(r.toUnit);
    setFromValue(r.fromValue);
    setShowRecents(false);
  }, []);

  return (
    <Layout title="Unit Converter">
      <div className={styles.container}>
        {/* Category selector */}
        <div className={styles.categoryScroll}>
          <SegmentedControl
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
            style={{ minWidth: 'max-content' }}
          />
        </div>

        {/* Converter card */}
        <Card variant="glass" className={`${styles.converterCard} animate-fadeInUp`}>
          {/* From field */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>From</label>
            <div className={styles.inputRow}>
              <input
                ref={fromInputRef}
                type="number"
                inputMode="decimal"
                step="any"
                className={styles.valueInput}
                value={fromValue}
                onChange={(e) => setFromValue(e.target.value)}
                placeholder="0"
                tabIndex={1}
              />
              <select
                className={styles.unitSelect}
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value)}
                tabIndex={2}
              >
                {unitKeys.map((key) => (
                  <option key={key} value={key}>{units[key].symbol}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Swap button */}
          <div className={styles.swapRow}>
            <button className={styles.swapButton} onClick={handleSwap} aria-label="Swap units" tabIndex={3}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To field */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>To</label>
            <div className={styles.inputRow}>
              <input
                type="text"
                className={`${styles.valueInput} ${styles.resultInput}`}
                value={fromValue ? resultStr : ''}
                readOnly
                tabIndex={-1}
              />
              <select
                className={styles.unitSelect}
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value)}
                tabIndex={4}
              >
                {unitKeys.map((key) => (
                  <option key={key} value={key}>{units[key].symbol}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Formula */}
          {formula && (
            <div className={styles.formula}>
              {formula}
            </div>
          )}

          {/* Action buttons */}
          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${copied ? styles.actionBtnCopied : ''}`}
              onClick={handleCopy}
            >
              {copied ? '\u2713 Copied' : 'Copy Result'}
            </button>
            <button
              className={`${styles.actionBtn} ${isFavorite ? styles.actionBtnFav : ''}`}
              onClick={toggleFavorite}
            >
              {isFavorite ? '\u2605 Favorited' : '\u2606 Favorite'}
            </button>
          </div>
        </Card>

        {/* Favorites */}
        {favorites.length > 0 && (
          <div className={`${styles.section} animate-fadeInUp`} style={{ animationDelay: '50ms' }}>
            <h3 className={styles.sectionTitle}>Favorites</h3>
            <div className={styles.chipList}>
              {favorites.map((key) => {
                const [cat, from, to] = key.split(':');
                const catUnits = UNITS[cat as Category];
                if (!catUnits || !catUnits[from] || !catUnits[to]) return null;
                return (
                  <button
                    key={key}
                    className={`${styles.chip} ${key === currentFavKey ? styles.chipActive : ''}`}
                    onClick={() => loadFavoriteConversion(key)}
                  >
                    {catUnits[from].symbol} \u2192 {catUnits[to].symbol}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent conversions */}
        <div className={`${styles.section} animate-fadeInUp`} style={{ animationDelay: '100ms' }}>
          <button
            className={styles.sectionToggle}
            onClick={() => setShowRecents(!showRecents)}
          >
            <h3 className={styles.sectionTitle}>Recent Conversions</h3>
            <span className={styles.toggleArrow} style={{ transform: showRecents ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              \u25BE
            </span>
          </button>
          {showRecents && recents.length > 0 && (
            <div className={styles.recentsList}>
              {recents.map((r, i) => (
                <button
                  key={`${r.timestamp}-${i}`}
                  className={styles.recentItem}
                  onClick={() => loadRecentConversion(r)}
                >
                  <span className={styles.recentValues}>
                    {r.fromValue} {UNITS[r.category]?.[r.fromUnit]?.symbol} = {r.toValue} {UNITS[r.category]?.[r.toUnit]?.symbol}
                  </span>
                  <span className={styles.recentCategory}>
                    {CATEGORY_OPTIONS.find((c) => c.value === r.category)?.label}
                  </span>
                </button>
              ))}
            </div>
          )}
          {showRecents && recents.length === 0 && (
            <p className={styles.emptyText}>No recent conversions yet</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
