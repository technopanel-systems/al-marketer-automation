// Text from files the team attaches (meeting reports): .docx, .pdf, .txt, .md. Extracted by code, never by AI, so the
// quotes the AI cites can be checked word for word against the saved text.
import { inflateRawSync } from 'node:zlib';

export const ACCEPTED_FILES = ['.docx', '.pdf', '.txt', '.md'];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const extOf = (name) => (String(name).toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0];

export function safeFileName(name) {
  const ext = extOf(name);
  const base = String(name).replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]+/gu, ' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 80) || 'file';
  return `${base}${ext}`;
}

// Reads one entry from a zip archive (enough for .docx: stored or deflated entries, no encryption).
export function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip compression ${method}`);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

// Word document → plain text: one line per paragraph, table cells separated by " | ", tabs and breaks kept.
export function docxText(buf) {
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('this .docx has no document text');
  const body = xml.toString('utf8');
  return body
    .replace(/>\s*\n\s*</g, '><')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>\s*<\/w:tc>/g, ' | ')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => decodeXml(l).replace(/[ \t]+\|\s*$/, '').replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, all) => l || (all[i - 1] && all[i - 1].trim()))
    .join('\n')
    .trim();
}

export async function pdfText(buf) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((page, i) => `--- page ${i + 1} ---\n${String(page).replace(/[ \t]+/g, ' ').trim()}`).join('\n\n').trim();
}

// → { text, kind } or throws a message a person can act on.
export async function extractText(buf, name) {
  const ext = extOf(name);
  if (!ACCEPTED_FILES.includes(ext)) throw new Error(`"${name}" is not a supported file. Attach a Word (.docx), PDF, .txt or .md file. Old .doc files: save as .docx first.`);
  if (buf.length > MAX_FILE_BYTES) throw new Error(`"${name}" is larger than 15 MB.`);
  let text = '';
  if (ext === '.txt' || ext === '.md') text = buf.toString('utf8').replace(/^﻿/, '');
  else if (ext === '.docx') text = docxText(buf);
  else if (ext === '.pdf') text = await pdfText(buf);
  text = text.replace(/\r\n/g, '\n').trim();
  if (text.replace(/\s|--- page \d+ ---/g, '').length < 20) throw new Error(`No readable text was found in "${name}". If it is a scanned PDF (a picture of text), copy the text into the notes box instead.`);
  return { text, kind: ext.slice(1) };
}
