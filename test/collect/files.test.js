// Meeting reports attached as files: text comes out by code, word for word, so quotes can be verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractText, docxText, safeFileName, unzipEntry } from '../../collect/files.js';

// A minimal zip writer (deflate) — enough to build a .docx in memory.
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// A one-page PDF with real text, built with correct cross-reference offsets.
function pdf(lines) {
  const stream = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="w"><w:body>
<w:p><w:r><w:t>تقرير اجتماع مع العميل</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">الميزانية الشهرية: </w:t></w:r><w:r><w:t>20 ألف ريال &amp; تشمل الإعلانات</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Goal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Launch in Riyadh</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

test('a Word meeting report gives its paragraphs and table rows as text, Arabic kept exactly', async () => {
  const docx = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': documentXml });
  assert.ok(unzipEntry(docx, 'word/document.xml'));
  const text = docxText(docx);
  assert.match(text, /^تقرير اجتماع مع العميل$/m);
  assert.match(text, /^الميزانية الشهرية: 20 ألف ريال & تشمل الإعلانات$/m, 'runs in one paragraph join; entities decode');
  assert.match(text, /Goal \|\s*\n?.*Launch in Riyadh/);
  const r = await extractText(docx, 'Meeting Report.DOCX');
  assert.equal(r.kind, 'docx');
});

test('a PDF report and plain text files are read; unsupported or empty files get a clear message', async () => {
  const r = await extractText(pdf(['Client wants more leads from Instagram', 'Budget is not decided yet']), 'report.pdf');
  assert.equal(r.kind, 'pdf');
  assert.match(r.text, /Client wants more leads from Instagram/);
  assert.match(r.text, /--- page 1 ---/);
  assert.equal((await extractText(Buffer.from('﻿ملاحظات الاجتماع: العميل يريد متجر إلكتروني'), 'notes.txt')).text, 'ملاحظات الاجتماع: العميل يريد متجر إلكتروني');
  await assert.rejects(extractText(Buffer.from('x'), 'old.doc'), /save as \.docx/);
  await assert.rejects(extractText(Buffer.from('   '), 'empty.md'), /No readable text/);
  assert.equal(safeFileName('../../تقرير <اجتماع>?.docx'), 'تقرير اجتماع .docx'.replace(' .', '.'));
});
