export interface GridItem {
  id: string;
  name: string;
  color: string;
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  justifySelf: AlignValue;
  alignSelf: AlignValue;
}

export type AlignValue = 'auto' | 'start' | 'center' | 'end' | 'stretch';

export interface GridConfig {
  columns: string[];
  rows: string[];
  columnGap: string;
  rowGap: string;
  justifyItems: AlignValue;
  alignItems: AlignValue;
  justifyContent: AlignValue;
  alignContent: AlignValue;
  items: GridItem[];
  areaNames: string[][];
}

export const STORAGE_KEY = 'css-grid-config';

const PASTEL_COLORS = [
  '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#f87171', '#a3e635', '#38bdf8', '#e879f9', '#fb923c',
  '#2dd4bf', '#c084fc', '#facc15', '#4ade80', '#f97316',
  '#818cf8',
];

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function getItemColor(index: number): string {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}

export function createDefaultConfig(): GridConfig {
  return {
    columns: ['1fr', '1fr', '1fr'],
    rows: ['1fr', '1fr', '1fr'],
    columnGap: '12px',
    rowGap: '12px',
    justifyItems: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    alignContent: 'stretch',
    items: [],
    areaNames: [],
  };
}

export function createItem(colStart: number, rowStart: number, index: number): GridItem {
  return {
    id: generateId(),
    name: `Item ${index + 1}`,
    color: getItemColor(index),
    colStart,
    colEnd: colStart + 1,
    rowStart,
    rowEnd: rowStart + 1,
    justifySelf: 'auto',
    alignSelf: 'auto',
  };
}

export function generateAreaTemplate(config: GridConfig): string | null {
  if (config.areaNames.length === 0) return null;
  const rows = config.areaNames.map(row => `"${row.join(' ')}"`);
  return rows.join('\n    ');
}

export function generateCss(config: GridConfig): string {
  const lines: string[] = ['.container {', '  display: grid;'];

  const areaTemplate = generateAreaTemplate(config);
  if (areaTemplate) {
    lines.push(`  grid-template-areas:\n    ${areaTemplate};`);
  }

  lines.push(`  grid-template-columns: ${config.columns.join(' ')};`);
  lines.push(`  grid-template-rows: ${config.rows.join(' ')};`);

  if (config.columnGap === config.rowGap) {
    lines.push(`  gap: ${config.columnGap};`);
  } else {
    lines.push(`  row-gap: ${config.rowGap};`);
    lines.push(`  column-gap: ${config.columnGap};`);
  }

  if (config.justifyItems !== 'stretch') lines.push(`  justify-items: ${config.justifyItems};`);
  if (config.alignItems !== 'stretch') lines.push(`  align-items: ${config.alignItems};`);
  if (config.justifyContent !== 'stretch') lines.push(`  justify-content: ${config.justifyContent};`);
  if (config.alignContent !== 'stretch') lines.push(`  align-content: ${config.alignContent};`);

  lines.push('}');

  config.items.forEach((item, i) => {
    const itemLines: string[] = [];
    if (item.colStart !== 1 || item.colEnd !== item.colStart + 1 || item.rowStart !== 1 || item.rowEnd !== item.rowStart + 1) {
      if (item.colEnd - item.colStart > 1 || item.colStart > 1) {
        itemLines.push(`  grid-column: ${item.colStart} / ${item.colEnd};`);
      }
      if (item.rowEnd - item.rowStart > 1 || item.rowStart > 1) {
        itemLines.push(`  grid-row: ${item.rowStart} / ${item.rowEnd};`);
      }
    }
    if (item.justifySelf !== 'auto') itemLines.push(`  justify-self: ${item.justifySelf};`);
    if (item.alignSelf !== 'auto') itemLines.push(`  align-self: ${item.alignSelf};`);

    if (itemLines.length > 0) {
      lines.push('');
      lines.push(`.item-${i + 1} {`);
      lines.push(...itemLines);
      lines.push('}');
    }
  });

  return lines.join('\n');
}

export function generateHtml(config: GridConfig): string {
  const lines: string[] = ['<div class="container">'];
  config.items.forEach((item, i) => {
    const hasClass = item.colStart !== 1 || item.colEnd !== item.colStart + 1 ||
      item.rowStart !== 1 || item.rowEnd !== item.rowStart + 1 ||
      item.justifySelf !== 'auto' || item.alignSelf !== 'auto';
    const cls = hasClass ? ` class="item-${i + 1}"` : '';
    lines.push(`  <div${cls}>${item.name}</div>`);
  });
  lines.push('</div>');
  return lines.join('\n');
}

export function saveConfig(config: GridConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore */ }
}

export function loadConfig(): GridConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GridConfig;
  } catch {
    return null;
  }
}

export function parseCss(css: string): Partial<GridConfig> | null {
  try {
    const result: Partial<GridConfig> = {};

    const colMatch = css.match(/grid-template-columns:\s*([^;]+)/);
    if (colMatch) result.columns = colMatch[1].trim().split(/\s+/);

    const rowMatch = css.match(/grid-template-rows:\s*([^;]+)/);
    if (rowMatch) result.rows = rowMatch[1].trim().split(/\s+/);

    const gapMatch = css.match(/(?:^|\s)gap:\s*([^;]+)/m);
    if (gapMatch) {
      const parts = gapMatch[1].trim().split(/\s+/);
      result.rowGap = parts[0];
      result.columnGap = parts[1] || parts[0];
    }

    const colGapMatch = css.match(/column-gap:\s*([^;]+)/);
    if (colGapMatch) result.columnGap = colGapMatch[1].trim();

    const rowGapMatch = css.match(/row-gap:\s*([^;]+)/);
    if (rowGapMatch) result.rowGap = rowGapMatch[1].trim();

    const jiMatch = css.match(/justify-items:\s*([^;]+)/);
    if (jiMatch) result.justifyItems = jiMatch[1].trim() as AlignValue;

    const aiMatch = css.match(/align-items:\s*([^;]+)/);
    if (aiMatch) result.alignItems = aiMatch[1].trim() as AlignValue;

    const jcMatch = css.match(/justify-content:\s*([^;]+)/);
    if (jcMatch) result.justifyContent = jcMatch[1].trim() as AlignValue;

    const acMatch = css.match(/align-content:\s*([^;]+)/);
    if (acMatch) result.alignContent = acMatch[1].trim() as AlignValue;

    return result;
  } catch {
    return null;
  }
}

export interface Preset {
  name: string;
  config: Partial<GridConfig> & { columns: string[]; rows: string[]; items?: GridItem[] };
}

export const PRESETS: Preset[] = [
  {
    name: 'Holy Grail',
    config: {
      columns: ['200px', '1fr', '200px'],
      rows: ['auto', '1fr', 'auto'],
      columnGap: '0px',
      rowGap: '0px',
      items: [
        { id: 'p1', name: 'Header', color: '#a78bfa', colStart: 1, colEnd: 4, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p2', name: 'Sidebar', color: '#60a5fa', colStart: 1, colEnd: 2, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p3', name: 'Content', color: '#34d399', colStart: 2, colEnd: 3, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p4', name: 'Aside', color: '#fbbf24', colStart: 3, colEnd: 4, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p5', name: 'Footer', color: '#f472b6', colStart: 1, colEnd: 4, rowStart: 3, rowEnd: 4, justifySelf: 'auto', alignSelf: 'auto' },
      ],
    },
  },
  {
    name: 'Sidebar + Content',
    config: {
      columns: ['250px', '1fr'],
      rows: ['1fr'],
      columnGap: '0px',
      rowGap: '0px',
      items: [
        { id: 'p1', name: 'Sidebar', color: '#a78bfa', colStart: 1, colEnd: 2, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p2', name: 'Content', color: '#34d399', colStart: 2, colEnd: 3, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
      ],
    },
  },
  {
    name: 'Dashboard',
    config: {
      columns: ['1fr', '1fr', '1fr'],
      rows: ['auto', '1fr', '1fr'],
      columnGap: '16px',
      rowGap: '16px',
      items: [
        { id: 'p1', name: 'Header', color: '#a78bfa', colStart: 1, colEnd: 4, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p2', name: 'Stats', color: '#60a5fa', colStart: 1, colEnd: 3, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p3', name: 'Activity', color: '#34d399', colStart: 3, colEnd: 4, rowStart: 2, rowEnd: 4, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p4', name: 'Chart', color: '#fbbf24', colStart: 1, colEnd: 2, rowStart: 3, rowEnd: 4, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p5', name: 'Table', color: '#f472b6', colStart: 2, colEnd: 3, rowStart: 3, rowEnd: 4, justifySelf: 'auto', alignSelf: 'auto' },
      ],
    },
  },
  {
    name: 'Card Grid',
    config: {
      columns: ['1fr', '1fr', '1fr'],
      rows: ['1fr', '1fr'],
      columnGap: '16px',
      rowGap: '16px',
      items: [
        { id: 'p1', name: 'Card 1', color: '#a78bfa', colStart: 1, colEnd: 2, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p2', name: 'Card 2', color: '#60a5fa', colStart: 2, colEnd: 3, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p3', name: 'Card 3', color: '#34d399', colStart: 3, colEnd: 4, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p4', name: 'Card 4', color: '#fbbf24', colStart: 1, colEnd: 2, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p5', name: 'Card 5', color: '#f472b6', colStart: 2, colEnd: 3, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p6', name: 'Card 6', color: '#f87171', colStart: 3, colEnd: 4, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
      ],
    },
  },
  {
    name: 'Header / Main / Footer',
    config: {
      columns: ['1fr'],
      rows: ['auto', '1fr', 'auto'],
      columnGap: '0px',
      rowGap: '0px',
      items: [
        { id: 'p1', name: 'Header', color: '#a78bfa', colStart: 1, colEnd: 2, rowStart: 1, rowEnd: 2, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p2', name: 'Main', color: '#34d399', colStart: 1, colEnd: 2, rowStart: 2, rowEnd: 3, justifySelf: 'auto', alignSelf: 'auto' },
        { id: 'p3', name: 'Footer', color: '#f472b6', colStart: 1, colEnd: 2, rowStart: 3, rowEnd: 4, justifySelf: 'auto', alignSelf: 'auto' },
      ],
    },
  },
];

export const ALIGN_OPTIONS: AlignValue[] = ['auto', 'start', 'center', 'end', 'stretch'];
export const CONTENT_ALIGN_OPTIONS: AlignValue[] = ['start', 'center', 'end', 'stretch', 'auto'];
export const UNIT_PRESETS = ['1fr', '2fr', 'auto', '100px', '200px', '250px', 'minmax(100px, 1fr)'];
