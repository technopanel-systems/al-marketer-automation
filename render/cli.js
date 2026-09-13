#!/usr/bin/env node
// Render a sample: node render/cli.js sample samples/hijab-store [--previews]
import { readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalogAndRules } from '../engine/rules/load.js';
import { buildPlan } from '../engine/plan/build.js';
import { assembleDeck } from '../engine/proposal/assemble.js';
import { renderProposal } from './render.js';

async function main() {
  const [cmd, dirArg, ...flags] = process.argv.slice(2);
  if (cmd !== 'sample' || !dirArg) {
    console.log('Usage: node render/cli.js sample <sample-dir> [--previews]');
    return 1;
  }
  const dir = resolve(dirArg);
  const input = JSON.parse(readFileSync(join(dir, 'plan-input.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(dir, 'content.json'), 'utf8'));
  const { catalog, rules } = loadCatalogAndRules();
  const plan = buildPlan({ catalog, rules, problems: input.problems, readiness: input.readiness, gate2: input.gate2 });
  if (!plan.ok) console.warn('Plan checks failed:', plan.checks.filter((c) => !c.ok));
  const model = assembleDeck({ client: input.client, content, plan });
  const started = Date.now();
  const result = await renderProposal(model, { outDir: join(dir, 'out'), baseName: basename(dir), previews: flags.includes('--previews') });
  console.log(JSON.stringify({ ...result.report, pdf: result.pdf, web: result.web, seconds: Math.round((Date.now() - started) / 100) / 10 }, null, 2));
  return result.report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
