// Runs one AI step through the official Claude Code CLI in headless mode, signed in with the owner's subscription.
// Each step: explicit model, tiny system prompt, no tools unless needed, JSON Schema output, validation, one retry.
// Fallback mode ("files"): the request is written to a file, Claude Code chat writes the answer file, the step is re-run.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv from 'ajv';
import { modelFor } from './models.js';
import { findClaude } from './claude-bin.js';

export class AiAuthError extends Error {}
export class AiPendingError extends Error {
  constructor(message, requestFile) {
    super(message);
    this.requestFile = requestFile;
  }
}
export class AiStepError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });
const MAX_ARGS_CHARS = 30000; // Windows command-line limit is 32 767 characters

// Environment variables of a parent Claude Code session that would make the child think it is nested.
const PARENT_SESSION_VARS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_PID'];

export function buildArgs({ model, systemPrompt, schema, tools = [], effort = null }) {
  const args = ['-p', '--model', model, ...(effort ? ['--effort', effort] : []), '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', systemPrompt, '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--permission-mode', 'dontAsk', '--tools', tools.join(',')];
  if (tools.length) args.push('--allowedTools', tools.join(','));
  const length = args.reduce((n, a) => n + a.length + 3, 0);
  if (length > MAX_ARGS_CHARS) throw new AiStepError(`Arguments too long for Windows (${length} chars) — shorten the system prompt or schema`);
  return args;
}

function runOnce({ bin, args, input, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const v of PARENT_SESSION_VARS) delete env[v];
    // bin may be a command name or [command, ...leadingArgs] (tests use [node, fake-cli.mjs]).
    const [cmd, ...lead] = Array.isArray(bin) ? bin : [bin];
    let child;
    try {
      child = spawn(cmd, [...lead, ...args], { cwd, env, windowsHide: true });
    } catch (e) {
      resolve({ code: null, stdout: '', stderr: e.message, spawnError: true });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs} ms`, timedOut: true });
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: e.message, spawnError: true });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

const looksLikeAuthProblem = (text) => /(invalid api key|please run \/login|not logged in|authentication_failed|oauth token|401 unauthorized)/i.test(text || '');

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function log(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(record) + '\n');
}

export function writeRequest(dir, step, { model, systemPrompt, prompt, schema, tools = [] }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${step}.request.md`);
  const body = [
    `# AI request: ${step}`,
    '',
    `Suggested model: ${model}. Tools allowed: ${tools.length ? tools.join(', ') : 'none'}.`,
    '',
    `Answer with ONE JSON object that matches "${step}.schema.json" and save it as "${step}.answer.json" in this folder, then run the step again.`,
    '',
    '## System prompt',
    '',
    systemPrompt,
    '',
    '## Task',
    '',
    prompt,
  ].join('\n');
  writeFileSync(file, body, 'utf8');
  writeFileSync(join(dir, `${step}.schema.json`), JSON.stringify(schema, null, 2), 'utf8');
  return file;
}

/**
 * @param {object} o
 * @param {string} o.step          unique request name, e.g. "research-business-pass1"
 * @param {'haiku'|'sonnet'|'opus'} o.model
 * @param {string} o.systemPrompt  short system prompt (goes on the command line)
 * @param {string} o.prompt        full task text incl. data (goes through stdin)
 * @param {object} o.schema        JSON Schema for the output
 * @param {Function} [o.check]     extra validation: (output) => string[] of problems
 * @param {string[]} [o.tools]     e.g. ['WebSearch']; default none
 * @param {string} [o.logFile]     jsonl run log
 * @param {string} [o.requestsDir] folder for fallback request/answer files
 */
export async function runAiStep(o) {
  const { step, systemPrompt, schema, check, tools = [], logFile, timeoutMs = 20 * 60_000, maxAttempts = 2, bin = findClaude().bin, requestsDir, mode = process.env.ALM_AI_MODE || 'cli' } = o;
  // Model, effort and fallback come from ai/models.js unless the call names them.
  const defaults = modelFor(step);
  const model = o.model || defaults.model;
  const effort = o.effort !== undefined ? o.effort : (defaults.effort ?? null);
  const fallback = o.fallback !== undefined ? o.fallback : (defaults.fallback ?? null);
  if (!model) throw new AiStepError(`AI step "${step}" has no model (add it to ai/models.js)`);
  const validateSchema = ajv.compile(schema);
  const validateAll = (output) => {
    const problems = [];
    if (!validateSchema(output)) problems.push(...validateSchema.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`));
    if (problems.length === 0 && check) problems.push(...(check(output) || []));
    return problems;
  };

  if (requestsDir) {
    const answerFile = join(requestsDir, `${step}.answer.json`);
    if (existsSync(answerFile)) {
      const output = tryJson(readFileSync(answerFile, 'utf8'));
      const problems = output === null ? ['answer file is not valid JSON'] : validateAll(output);
      if (logFile) log(logFile, { step, model: 'claude-code-chat', attempt: 1, at: new Date().toISOString(), mode: 'files', valid: problems.length === 0, problems: problems.slice(0, 20) });
      if (problems.length) {
        const prompt = `${o.prompt}\n\n<previous_attempt_problems>\nYour previous answer was rejected by automatic checks. Fix ALL of these:\n${problems.map((x) => `- ${x}`).join('\n')}\n</previous_attempt_problems>`;
        writeRequest(requestsDir, step, { model, systemPrompt, prompt, schema, tools });
        renameSync(answerFile, join(requestsDir, `${step}.rejected-${Date.now()}.json`));
        throw new AiPendingError(`Answer for "${step}" failed checks — the request file lists the problems. Answer it again.`, join(requestsDir, `${step}.request.md`));
      }
      renameSync(answerFile, join(requestsDir, `${step}.used-${Date.now()}.json`));
      return { output, attempts: [], costUsdEstimate: 0, mode: 'files' };
    }
    if (mode === 'files') {
      const file = writeRequest(requestsDir, step, { model, systemPrompt, prompt: o.prompt, schema, tools });
      throw new AiPendingError(`AI step "${step}" is waiting for an answer from Claude Code chat (fallback mode).`, file);
    }
  }

  const cwd = mkdtempSync(join(tmpdir(), 'alm-ai-'));
  const attempts = [];
  const withProblems = (problems) => `${o.prompt}\n\n<previous_attempt_problems>\nYour previous answer was rejected by automatic checks. Fix ALL of these and answer again:\n${problems.map((x) => `- ${x}`).join('\n')}\n</previous_attempt_problems>`;
  try {
    return await tryModel({ model, effort, maxAttempts, prompt: o.prompt });
  } catch (e) {
    // One more try on the fallback model (see ai/models.js), never for a login or installation problem.
    if (!(e instanceof AiStepError) || !fallback || fallback === model || e.details?.spawn) throw e;
    if (logFile) log(logFile, { step, model, at: new Date().toISOString(), fallbackTo: fallback, reason: String(e.message).slice(0, 300) });
    return await tryModel({ model: fallback, effort: o.fallbackEffort ?? effort, maxAttempts: 1, prompt: e.details?.problems?.length ? withProblems(e.details.problems) : o.prompt, fallbackFrom: model });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }

  async function tryModel({ model, effort, maxAttempts, prompt, fallbackFrom = null }) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      const res = await runOnce({ bin, args: buildArgs({ model, systemPrompt, schema, tools, effort }), input: prompt, cwd, timeoutMs });
      const parsed = tryJson(res.stdout);
      const record = {
        step,
        model,
        ...(fallbackFrom ? { fallbackFrom } : {}),
        attempt,
        at: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        exitCode: res.code,
        costUsdEstimate: parsed?.total_cost_usd ?? null,
        inputTokens: parsed ? (parsed.usage?.input_tokens || 0) + (parsed.usage?.cache_creation_input_tokens || 0) + (parsed.usage?.cache_read_input_tokens || 0) : null,
        outputTokens: parsed?.usage?.output_tokens ?? null,
        turns: parsed?.num_turns ?? null,
        models: parsed?.modelUsage ? Object.keys(parsed.modelUsage) : [],
      };
      if (res.spawnError) throw new AiStepError(`Could not start the Claude Code CLI (${res.stderr}). Is Claude Code installed and on PATH?`, { spawn: true });
      if (!parsed || parsed.is_error) {
        const text = `${res.stdout}\n${res.stderr}\n${parsed?.result || ''}`;
        record.error = String(parsed?.result || res.stderr || res.stdout || 'no output').slice(0, 500);
        attempts.push(record);
        if (logFile) log(logFile, record);
        if (looksLikeAuthProblem(text)) {
          if (requestsDir) writeRequest(requestsDir, step, { model, systemPrompt, prompt: o.prompt, schema, tools });
          throw new AiAuthError('Claude Code could not use the subscription login in headless mode. The request was saved for Claude Code chat (fallback mode); or sign in again by opening "claude" and typing /login.');
        }
        if (attempt === maxAttempts) throw new AiStepError(`AI step "${step}" failed: ${record.error}`, { attempts });
        continue;
      }
      const output = parsed.structured_output ?? tryJson(parsed.result);
      const problems = output === null || output === undefined ? ['no structured output returned'] : validateAll(output);
      record.valid = problems.length === 0;
      if (problems.length) record.problems = problems.slice(0, 20);
      attempts.push(record);
      if (logFile) log(logFile, record);
      if (problems.length === 0) return { output, attempts, model, costUsdEstimate: attempts.reduce((s, a) => s + (a.costUsdEstimate || 0), 0) };
      if (attempt < maxAttempts) {
        prompt = withProblems(problems);
      } else {
        throw new AiStepError(`AI step "${step}" output failed checks after ${attempts.length} attempt(s): ${problems.slice(0, 5).join(' · ')}`, { problems, output, attempts });
      }
    }
    throw new AiStepError(`AI step "${step}" did not produce output`, { attempts });
  }
}
