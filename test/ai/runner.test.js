import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runAiStep, AiAuthError, AiPendingError, AiStepError, buildArgs } from '../../ai/runner.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = { type: 'object', required: ['answer', 'count'], additionalProperties: false, properties: { answer: { type: 'string' }, count: { type: 'integer' } } };

// Node on Windows cannot spawn .cmd files without a shell, so the runner accepts [command, ...args].
const fakeBin = () => [process.execPath, join(here, 'fake-claude.mjs')];

async function withEnv(vars, fn) {
  const old = {};
  for (const [k, v] of Object.entries(vars)) {
    old[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const base = (dir) => ({ step: 't', model: 'haiku', systemPrompt: 'sys', prompt: 'task', schema, logFile: join(dir, 'runs.jsonl') });

test('builds locked-down headless arguments (no --bare, no tools by default)', () => {
  const args = buildArgs({ model: 'sonnet', systemPrompt: 's', schema });
  assert.ok(!args.includes('--bare'));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  const withSearch = buildArgs({ model: 'sonnet', systemPrompt: 's', schema, tools: ['WebSearch'] });
  assert.equal(withSearch[withSearch.indexOf('--allowedTools') + 1], 'WebSearch');
});

test('returns validated structured output and logs the run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-run-'));
  try {
    const res = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => runAiStep({ ...base(dir), bin: fakeBin(dir) }));
    assert.deepEqual(res.output, { answer: 'ok', count: 1 });
    const logged = readFileSync(join(dir, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(logged[0].valid, true);
    assert.equal(logged[0].model, 'haiku');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retries once with the schema problems, then succeeds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-run-'));
  try {
    const res = await withEnv({ FAKE_CLAUDE_MODE: 'bad-then-good' }, () => runAiStep({ ...base(dir), bin: fakeBin(dir) }));
    assert.equal(res.attempts.length, 2);
    assert.equal(res.output.count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('extra checks count as failures and are fed back; persistent failure throws', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-run-'));
  try {
    const check = (o) => (o.answer === 'forbidden' ? ['answer uses a forbidden word'] : []);
    const res = await withEnv({ FAKE_CLAUDE_MODE: 'check-fails-once', FAKE_CLAUDE_COUNTER: join(dir, 'n') }, () => runAiStep({ ...base(dir), bin: fakeBin(dir), check }));
    assert.equal(res.output.answer, 'fine');
    await assert.rejects(withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => runAiStep({ ...base(dir), bin: fakeBin(dir), check: () => ['always wrong'] })), AiStepError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth failure saves the request for fallback mode', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-run-'));
  try {
    await assert.rejects(withEnv({ FAKE_CLAUDE_MODE: 'auth' }, () => runAiStep({ ...base(dir), bin: fakeBin(dir), requestsDir: join(dir, 'req') })), AiAuthError);
    assert.ok(existsSync(join(dir, 'req', 't.request.md')));
    assert.ok(existsSync(join(dir, 'req', 't.schema.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('files mode: waits for an answer, rejects a bad answer, accepts a good one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'alm-run-'));
  const req = join(dir, 'req');
  try {
    const o = { ...base(dir), requestsDir: req, mode: 'files' };
    await assert.rejects(runAiStep(o), AiPendingError);
    writeFileSync(join(req, 't.answer.json'), JSON.stringify({ answer: 'x', count: 'many' }));
    await assert.rejects(runAiStep(o), AiPendingError);
    assert.match(readFileSync(join(req, 't.request.md'), 'utf8'), /previous_attempt_problems/);
    writeFileSync(join(req, 't.answer.json'), JSON.stringify({ answer: 'x', count: 3 }));
    const res = await runAiStep(o);
    assert.equal(res.output.count, 3);
    assert.equal(existsSync(join(req, 't.answer.json')), false, 'answer is archived after use');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
