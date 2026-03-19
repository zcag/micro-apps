// RFC 4180 compliant CSV parser — no external libraries

export type Delimiter = ',' | ';' | '\t' | '|';

export interface ParseOptions {
  delimiter: Delimiter | 'auto';
  firstRowHeaders: boolean;
  trimWhitespace: boolean;
  skipEmptyRows: boolean;
}

export interface ParseResult {
  headers: string[];
  rows: string[][];
  delimiter: Delimiter;
}

const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];

export function detectDelimiter(input: string): Delimiter {
  // Count occurrences of each delimiter in the first few lines
  const sampleLines = input.split('\n').slice(0, 5).join('\n');
  let best: Delimiter = ',';
  let bestCount = 0;

  for (const d of DELIMITERS) {
    // Count only delimiters outside quoted fields
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sampleLines.length; i++) {
      const ch = sampleLines[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < sampleLines.length && sampleLines[i + 1] === '"') {
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === d && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }

  return best;
}

export function parseCSV(input: string, options: ParseOptions): ParseResult {
  const delimiter = options.delimiter === 'auto' ? detectDelimiter(input) : options.delimiter;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        currentRow.push(options.trimWhitespace ? currentField.trim() : currentField);
        currentField = '';
        i++;
      } else if (ch === '\r') {
        // Handle \r\n and bare \r
        currentRow.push(options.trimWhitespace ? currentField.trim() : currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        if (i < input.length && input[i] === '\n') i++;
      } else if (ch === '\n') {
        currentRow.push(options.trimWhitespace ? currentField.trim() : currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Push last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(options.trimWhitespace ? currentField.trim() : currentField);
    rows.push(currentRow);
  }

  // Filter empty rows
  let filteredRows = options.skipEmptyRows
    ? rows.filter(row => row.some(cell => cell !== ''))
    : rows;

  // Extract headers
  let headers: string[];
  if (options.firstRowHeaders && filteredRows.length > 0) {
    headers = filteredRows[0];
    filteredRows = filteredRows.slice(1);
  } else {
    const maxCols = filteredRows.reduce((max, row) => Math.max(max, row.length), 0);
    headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
  }

  // Normalize row lengths to match headers
  filteredRows = filteredRows.map(row => {
    if (row.length < headers.length) {
      return [...row, ...Array(headers.length - row.length).fill('')];
    }
    return row.slice(0, Math.max(row.length, headers.length));
  });

  return { headers, rows: filteredRows, delimiter };
}

export function csvToJSON(parsed: ParseResult, indent: string): string {
  const objects = parsed.rows.map(row => {
    const obj: Record<string, string> = {};
    parsed.headers.forEach((header, i) => {
      obj[header] = row[i] ?? '';
    });
    return obj;
  });
  return JSON.stringify(objects, null, indent || undefined);
}

export function jsonToCSV(input: string, delimiter: Delimiter): { csv: string; headers: string[]; rows: string[][] } {
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed)) {
    throw new Error('Input must be a JSON array');
  }
  if (parsed.length === 0) {
    return { csv: '', headers: [], rows: [] };
  }

  // Collect all unique keys in order
  const headersSet = new Set<string>();
  for (const obj of parsed) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new Error('Each array element must be a JSON object');
    }
    Object.keys(obj).forEach(k => headersSet.add(k));
  }
  const headers = Array.from(headersSet);

  const escapeField = (value: string): string => {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(delimiter) || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const rows = parsed.map(obj =>
    headers.map(h => String(obj[h] ?? ''))
  );

  const lines = [
    headers.map(escapeField).join(delimiter),
    ...rows.map(row => row.map(escapeField).join(delimiter)),
  ];

  return { csv: lines.join('\n'), headers, rows };
}
