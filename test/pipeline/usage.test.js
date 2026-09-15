import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { usageSummary, usd } from '../../pipeline/usage.js';

const dir = mkdtempSync(join(tmpdir(), 'alm-usage-'));
after(() => rmSync(dir, { recursive: true, force: true }));

test('Claude usage is summed per pipeline step from the run log, failed attempts included', () => {
  mkdirSync(join(dir, 'logs'));
  const runLog = join(dir, 'logs', 'runs.jsonl');
  const lines = [
    { step: 'research-business-pass1', model: 'sonnet', durationMs: 34016, costUsdEstimate: 0.154887, inputTokens: 30197, outputTokens: 3120, valid: true },
    { step: 'research-brand-pass1', model: 'sonnet', durationMs: 48572, costUsdEstimate: 0.1414, inputTokens: 18932, outputTokens: 4919, valid: true },
    { step: 'diagnose', model: 'opus', durationMs: 127000, costUsdEstimate: 0.65, valid: true },
    { step: 'write', model: 'opus', durationMs: 20000, costUsdEstimate: null, error: 'timeout' },
    { step: 'write', model: 'opus', durationMs: 133000, costUsdEstimate: 0.44, valid: true },
    { step: 'language-review', model: 'sonnet', durationMs: 18000, costUsdEstimate: 0.05, valid: true },
    { step: 'notes', model: 'claude-code-chat', mode: 'files', valid: true },
  ];
  writeFileSync(runLog, `${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot json\n`);
  const u = usageSummary({ runLog });
  const by = Object.fromEntries(u.steps.map((s) => [s.id, s]));
  assert.equal(by.research.runs, 2);
  assert.equal(by.research.costUsd, 0.3);
  assert.equal(by.write.runs, 2);
  assert.equal(by.write.failed, 1);
  assert.equal(by.write.unknownCost, 1, 'a run without a reported cost is counted, not guessed');
  assert.equal(by.check.label, 'Language review');
  assert.ok(!by.notes, 'answers typed in Claude Code chat are not runs');
  assert.equal(u.total.costUsd, 1.44);
  assert.equal(u.total.runs, 6);
  assert.equal(usd(1.436), '$1.44');
  assert.deepEqual(usageSummary({ runLog: join(dir, 'missing.jsonl') }).total.runs, 0);
});
