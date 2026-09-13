// Converts between the local catalog and the three CSV files people can edit in Excel or Google Sheets.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES, TABLE_NAMES, sortRows } from './model.js';
import { csvToRecords, writeCsv } from './csv.js';
import { writeFileAtomic } from './store.js';

const TRUE = new Set(['yes', 'y', 'true', '1', 'نعم']);
const FALSE = new Set(['no', 'n', 'false', '0', 'لا']);

function toCsvValue(col, value) {
  switch (col.type) {
    case 'bool':
      return value ? 'yes' : 'no';
    case 'intOrNull':
      return value === null || value === undefined ? '' : String(value);
    case 'idList':
      return (value || []).join('; ');
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

function fromCsvValue(col, raw) {
  const text = String(raw ?? '').trim();
  switch (col.type) {
    case 'int':
      if (!/^-?\d+$/.test(text)) return { error: `must be a whole number (got "${text}")` };
      return { value: Number(text) };
    case 'intOrNull':
      if (text === '') return { value: null };
      if (!/^-?\d+$/.test(text)) return { error: `must be a whole number or empty (got "${text}")` };
      return { value: Number(text) };
    case 'bool':
      if (TRUE.has(text.toLowerCase())) return { value: true };
      if (FALSE.has(text.toLowerCase())) return { value: false };
      return { error: `must be yes or no (got "${text}")` };
    case 'idList':
      return { value: text === '' ? [] : text.split(/[;,]/).map((s) => s.trim()).filter(Boolean) };
    default:
      return { value: text };
  }
}

export function catalogToCsvFiles(catalog) {
  const files = {};
  for (const t of TABLE_NAMES) {
    const header = TABLES[t].columns.map((c) => c.csv);
    const records = sortRows(catalog[t] || []).map((row) => {
      const rec = {};
      for (const col of TABLES[t].columns) rec[col.csv] = toCsvValue(col, row[col.key]);
      return rec;
    });
    files[TABLES[t].file] = writeCsv(header, records);
  }
  return files;
}

export function exportCsv(catalog, csvDir) {
  const files = catalogToCsvFiles(catalog);
  for (const [name, text] of Object.entries(files)) writeFileAtomic(join(csvDir, name), text);
  return Object.keys(files).map((name) => join(csvDir, name));
}

// Parses the CSV files into a catalog object. Returns { catalog, errors, warnings } — never throws for bad data.
export function readCsvCatalog(csvDir) {
  const errors = [];
  const warnings = [];
  const catalog = {};
  for (const t of TABLE_NAMES) {
    const def = TABLES[t];
    const file = join(csvDir, def.file);
    catalog[t] = [];
    if (!existsSync(file)) {
      errors.push(`${def.file}: file not found in ${csvDir}`);
      continue;
    }
    let parsed;
    try {
      parsed = csvToRecords(readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${def.file}: ${e.message}`);
      continue;
    }
    const expected = def.columns.map((c) => c.csv);
    const missing = expected.filter((h) => !parsed.header.includes(h));
    if (missing.length) {
      errors.push(`${def.file}: missing column(s) ${missing.join(', ')}`);
      continue;
    }
    const unknown = parsed.header.filter((h) => h && !expected.includes(h));
    if (unknown.length) warnings.push(`${def.file}: ignoring unknown column(s) ${unknown.join(', ')}`);

    for (const rec of parsed.records) {
      if (rec.__extraCells) errors.push(`${def.file} line ${rec.__line}: more cells than columns (check for an unquoted comma)`);
      const row = {};
      for (const col of def.columns) {
        const { value, error } = fromCsvValue(col, rec[col.csv]);
        if (error) errors.push(`${def.file} line ${rec.__line}, column "${col.csv}": ${error}`);
        row[col.key] = value;
      }
      catalog[t].push(row);
    }
  }
  return { catalog, errors, warnings };
}
