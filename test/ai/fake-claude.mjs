// Stand-in for the Claude Code CLI used by runner tests. Behaviour is chosen with FAKE_CLAUDE_MODE.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const input = readFileSync(0, 'utf8');
const mode = process.env.FAKE_CLAUDE_MODE || 'ok';
const counter = process.env.FAKE_CLAUDE_COUNTER;
let call = 1;
if (counter) {
  call = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) + 1 : 1;
  writeFileSync(counter, String(call));
}
const args = process.argv.slice(2);
const out = (obj) => process.stdout.write(JSON.stringify(obj));
const base = { type: 'result', subtype: 'success', is_error: false, num_turns: 1, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 }, modelUsage: { [args[args.indexOf('--model') + 1]]: {} } };

if (mode === 'auth') {
  out({ ...base, is_error: true, subtype: 'error', result: 'Invalid API key · Please run /login' });
} else if (mode === 'bad-then-good') {
  const good = input.includes('previous_attempt_problems');
  out({ ...base, structured_output: good ? { answer: 'ok', count: 2 } : { answer: 'ok', count: 'two' } });
} else if (mode === 'check-fails-once') {
  out({ ...base, structured_output: { answer: call === 1 ? 'forbidden' : 'fine', count: 1 } });
} else {
  out({ ...base, structured_output: { answer: 'ok', count: 1 } });
}
