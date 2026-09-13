// Detects platforms, tracking pixels and tools from captured HTML, request URLs, cookies and headers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../engine/catalog/store.js';

let cached;
function fingerprints() {
  if (!cached) {
    const data = JSON.parse(readFileSync(join(ROOT, 'rules', 'tech-fingerprints.json'), 'utf8'));
    cached = data.technologies.map((t) => ({
      ...t,
      re: {
        html: (t.html || []).map((p) => new RegExp(p, 'i')),
        requests: (t.requests || []).map((p) => new RegExp(p, 'i')),
        headers: (t.headers || []).map((p) => new RegExp(p, 'i')),
      },
    }));
  }
  return cached;
}

/**
 * @param {Array<{url, html, requests: string[], headers: object}>} pages
 * @returns {{ detected: Array<{id,name,category,foundOn:string[],signal:string}>, notDetected: Array<{id,name,category}> }}
 */
export function detectTech(pages) {
  const detected = new Map();
  for (const page of pages) {
    const headerText = Object.entries(page.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    for (const t of fingerprints()) {
      let signal = null;
      const html = page.html || '';
      for (const re of t.re.html) if (!signal && re.test(html)) signal = `html matches ${re.source}`;
      for (const re of t.re.requests) if (!signal && (page.requests || []).some((u) => re.test(u))) signal = `request matches ${re.source}`;
      for (const re of t.re.headers) if (!signal && re.test(headerText)) signal = `header matches ${re.source}`;
      if (!signal) continue;
      if (!detected.has(t.id)) detected.set(t.id, { id: t.id, name: t.name, category: t.category, foundOn: [], signal });
      detected.get(t.id).foundOn.push(page.url);
    }
  }
  const notDetected = fingerprints().filter((t) => !detected.has(t.id)).map(({ id, name, category }) => ({ id, name, category }));
  return { detected: [...detected.values()], notDetected };
}
