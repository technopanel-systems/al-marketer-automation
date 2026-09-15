// Archive and delete proposals.
// Archiving moves the folder to clients/_archive/<slug>--<date-time>: it leaves the list, nothing more runs, its files stay,
// and a new proposal for the same customer starts clean under the same folder name. Restoring moves it back
// (as <slug>-2 when that name was taken meanwhile). Deleting first moves the folder aside in one step, then removes it,
// so a file Windows keeps locked can never leave half a proposal behind under the old name.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENTS_DIR, clientPaths, load, save } from './client.js';

export const ARCHIVE_DIR = join(CLIENTS_DIR, '_archive');
const TRASH_DIR = join(CLIENTS_DIR, '_trash');
const ARCHIVE_ID = /^[a-z0-9][a-z0-9-]{0,80}--\d{8}-\d{6}$/;

export const validArchiveId = (id) => ARCHIVE_ID.test(String(id || '')) && existsSync(join(ARCHIVE_DIR, id, 'intake.json'));
const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// A folder rename is all-or-nothing. Windows refuses it while a file inside is open, so it is retried briefly.
function moveDir(from, to) {
  mkdirSync(join(to, '..'), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const locked = ['EPERM', 'EBUSY', 'EACCES'].includes(e.code);
      if (locked && attempt < 6) {
        pause(200 * attempt);
        continue;
      }
      throw new Error(locked ? 'Windows would not move the folder because a file in it is open (for example the PDF, or the folder in File Explorer). Close it and try again.' : e.message);
    }
  }
}

function freeName(dir, base) {
  let name = base;
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${base}-${i}`;
  return name;
}

// Moves a proposal out of the list. `status` is what it had reached (shown on the Archived page). Returns the archive id.
export function archiveClient(slug, { status = '', now = new Date() } = {}) {
  const p = clientPaths(slug);
  if (!existsSync(p.intake)) throw new Error('That proposal does not exist.');
  const id = freeName(ARCHIVE_DIR, `${slug}--${stamp(now)}`);
  save(join(p.dir, 'archived.json'), { slug, status, archivedAt: now.toISOString() });
  try {
    moveDir(p.dir, join(ARCHIVE_DIR, id));
  } catch (e) {
    rmSync(join(p.dir, 'archived.json'), { force: true });
    throw e;
  }
  return id;
}

export function listArchived() {
  if (!existsSync(ARCHIVE_DIR)) return [];
  return readdirSync(ARCHIVE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && validArchiveId(d.name))
    .map((d) => {
      const dir = join(ARCHIVE_DIR, d.name);
      const intake = load(join(dir, 'intake.json'), {});
      const info = load(join(dir, 'archived.json'), {});
      const outputDir = join(dir, 'output');
      const finals = existsSync(outputDir) ? readdirSync(outputDir).filter((f) => /-proposal-v\d+\.(pdf|html)$/.test(f)) : [];
      const version = (f) => Number(f.match(/-v(\d+)\.\w+$/)[1]);
      const latest = Math.max(0, ...finals.map(version));
      return {
        id: d.name,
        slug: info.slug || d.name.split('--')[0],
        name: intake.name || d.name,
        displayName: intake.displayName || '',
        website: intake.website || '',
        status: info.status || '',
        archivedAt: info.archivedAt || '',
        version: latest || null,
        files: finals.filter((f) => version(f) === latest).sort(),
      };
    })
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}

// Puts an archived proposal back in the list. Returns its folder name.
export function restoreArchived(id) {
  if (!validArchiveId(id)) throw new Error('That archived proposal does not exist.');
  const slug = freeName(CLIENTS_DIR, id.split('--')[0]);
  moveDir(join(ARCHIVE_DIR, id), join(CLIENTS_DIR, slug));
  rmSync(join(CLIENTS_DIR, slug, 'archived.json'), { force: true });
  return slug;
}

function removeDir(dir) {
  const aside = join(TRASH_DIR, freeName(TRASH_DIR, `${Date.now().toString(36)}`));
  moveDir(dir, aside);
  try {
    rmSync(aside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    rmdirSync(TRASH_DIR);
  } catch {
    // Already out of the list; what is left is removed the next time the Control Center starts.
  }
}

export function deleteClient(slug) {
  const p = clientPaths(slug);
  if (!existsSync(p.intake)) throw new Error('That proposal does not exist.');
  removeDir(p.dir);
}

export function deleteArchived(id) {
  if (!validArchiveId(id)) throw new Error('That archived proposal does not exist.');
  removeDir(join(ARCHIVE_DIR, id));
}

// Anything a locked file kept from being removed last time.
export function emptyTrash() {
  try {
    if (existsSync(TRASH_DIR)) rmSync(TRASH_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {}
}
