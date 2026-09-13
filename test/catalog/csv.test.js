import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, writeCsv, csvToRecords } from '../../engine/catalog/csv.js';

test('round-trips Arabic text, commas, quotes and line breaks', () => {
  const header = ['id', 'name_ar', 'note'];
  const records = [
    { id: 'a', name_ar: 'إدارة البراند، والتسويق', note: 'He said "hi"' },
    { id: 'b', name_ar: 'سطر أول\nسطر ثاني', note: '' },
  ];
  const text = writeCsv(header, records);
  assert.ok(text.startsWith('﻿'), 'written with a BOM for Excel');
  const back = csvToRecords(text);
  assert.deepEqual(back.header, header);
  assert.deepEqual(back.records.map(({ __line, ...r }) => r), records);
});

test('reads files without a BOM and with LF or CRLF endings (Google Sheets / Excel)', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y",2'), [['a', 'b'], ['x, y', '2']]);
});

test('keeps empty trailing cells', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,\n'), [['a', 'b', 'c'], ['1', '', '']]);
});

test('rejects an unclosed quote', () => {
  assert.throws(() => parseCsv('a,b\n"broken,2\n'), /unclosed/);
});

test('flags rows with more cells than columns', () => {
  const { records } = csvToRecords('id,name\nx,y,extra\n');
  assert.equal(records[0].__extraCells, true);
});
