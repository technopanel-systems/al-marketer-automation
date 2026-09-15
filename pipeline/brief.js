// What the brief form brings besides the intake itself: attached meeting reports (text extracted by code and saved
// next to the original), removed files, and the readiness answers. The logo choice is returned for a background job.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractText, safeFileName } from '../collect/files.js';
import { saveAnswer } from './steps/record.js';
import { load, save } from './client.js';
import { READINESS_KEYS } from '../ai/fields.js';

export const extractedName = (file) => `${file}.extracted.txt`;

export async function applyBriefInputs(p, b, files = []) {
  const saved = [];
  const errors = [];
  mkdirSync(p.filesDir, { recursive: true });
  for (const name of b.getAll('remove_file')) {
    const safe = safeFileName(name);
    rmSync(join(p.filesDir, safe), { force: true });
    rmSync(join(p.filesDir, extractedName(safe)), { force: true });
  }
  for (const f of files.filter((x) => x.field === 'notes_files')) {
    try {
      const { text } = await extractText(f.data, f.filename);
      let safe = safeFileName(f.filename);
      for (let i = 2; existsSync(join(p.filesDir, safe)); i++) safe = safeFileName(f.filename).replace(/(\.[a-z0-9]+)$/i, ` (${i})$1`);
      writeFileSync(join(p.filesDir, safe), f.data);
      writeFileSync(join(p.filesDir, extractedName(safe)), text, 'utf8');
      saved.push({ name: safe, chars: text.length });
    } catch (e) {
      errors.push(e.message);
    }
  }
  // Readiness: only answers that differ from what is already known are saved, so nothing re-runs for no reason.
  const answers = load(join(p.recordDir, 'answers.json'), {});
  const record = load(p.readiness, {});
  let readinessChanged = 0;
  for (const key of Object.keys(READINESS_KEYS)) {
    const value = b.get(`readiness_${key}`);
    if (!['yes', 'no', 'unknown'].includes(value)) continue;
    const current = answers[`readiness:${key}`]?.answer || record[key]?.value || 'unknown';
    if (value === current) continue;
    saveAnswer(p, `readiness:${key}`, value);
    readinessChanged++;
  }
  const choice = b.get('logo_choice') || '';
  const logoFile = files.find((x) => x.field === 'logo_file');
  let logo = null;
  const setNoLogo = (value) => {
    const intake = load(p.intake, null);
    if (intake && Boolean(intake.noLogo) !== value) save(p.intake, { ...intake, noLogo: value });
  };
  if (choice && choice !== 'none' && choice !== 'keep') setNoLogo(false);
  if (choice.startsWith('url:')) logo = { url: choice.slice(4), source: 'website' };
  else if (choice === 'upload' && logoFile) logo = { buf: logoFile.data, filename: logoFile.filename, source: 'uploaded' };
  else if (choice === 'svg' && b.get('logo_svg_png')) logo = { buf: Buffer.from(b.get('logo_svg_png'), 'base64'), type: 'image/png', source: 'website header' };
  else if (choice === 'none') {
    rmSync(p.logo, { force: true });
    rmSync(p.logoInfo, { force: true });
    setNoLogo(true);
  }
  return { saved, errors, readinessChanged, logo };
}
