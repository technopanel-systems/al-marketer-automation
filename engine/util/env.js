// Loads keys from .env.local (written by the setup .cmd files) without overriding variables that are already set.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT } from '../catalog/store.js';

export function loadLocalEnv(root = ROOT) {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return [];
  const loaded = [];
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (v && process.env[k] === undefined) {
      process.env[k] = v;
      loaded.push(k);
    }
  }
  return loaded;
}
