// RFC 4180 CSV parsing and writing. UTF-8 with BOM on write so Excel shows Arabic correctly;
// the BOM is stripped on read so Google Sheets exports (no BOM) work too.

const BOM = '﻿';

export function parseCsv(text) {
  if (text.startsWith(BOM)) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\r') {
      // handled with the following \n (or a lone \r line ending)
      if (text[i + 1] !== '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        fieldStarted = false;
      }
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) throw new Error('CSV has an unclosed quoted field');
  if (fieldStarted || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop fully empty lines (e.g. trailing blank lines from spreadsheet exports)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function escapeField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(header, records) {
  const lines = [header.map(escapeField).join(',')];
  for (const rec of records) lines.push(header.map((h) => escapeField(rec[h])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

// Returns { header, records } where records are objects keyed by header names.
export function csvToRecords(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells, idx) => {
    const rec = { __line: idx + 2 };
    header.forEach((h, i) => {
      rec[h] = cells[i] === undefined ? '' : cells[i];
    });
    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim() !== '')) {
      rec.__extraCells = true;
    }
    return rec;
  });
  return { header, records };
}
