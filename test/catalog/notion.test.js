import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotionClient, fetchTable, NotionError } from '../../engine/catalog/notion.js';

function fakeFetch(routes, calls = []) {
  return async (url, init) => {
    const path = url.replace('https://api.notion.com/v1', '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const handler = routes[`${init.method} ${path.split('?')[0]}`];
    const out = typeof handler === 'function' ? handler(path, init) : handler;
    if (!out) return { ok: false, status: 404, headers: new Map(), json: async () => ({ code: 'object_not_found', message: 'not found' }) };
    return { ok: out.status ? out.status < 400 : true, status: out.status || 200, headers: new Map(Object.entries(out.headers || {})), json: async () => out.body };
  };
}

const page = (id, title, extra = {}) => ({
  id,
  properties: {
    Deliverable: { type: 'title', title: [{ plain_text: title }] },
    Description: { type: 'rich_text', rich_text: [{ plain_text: 'وصف' }] },
    Offering: { id: 'rel1', type: 'relation', relation: [{ id: 'off-1' }], has_more: false },
    Service: { id: 'rel2', type: 'relation', relation: [], has_more: false },
    ...extra,
  },
});

const config = { databaseId: 'db1', titleProperty: 'Deliverable', descriptionProperty: 'Description', offeringRelation: 'Offering', serviceRelation: 'Service' };

test('reads a database through its data source with pagination and sends the pinned version', async () => {
  const calls = [];
  let query = 0;
  const client = createNotionClient({
    token: 't',
    version: '2026-03-11',
    fetchImpl: fakeFetch(
      {
        'GET /databases/db1': { body: { data_sources: [{ id: 'ds1' }] } },
        'POST /data_sources/ds1/query': () => (++query === 1
          ? { body: { results: [page('p1', 'A')], has_more: true, next_cursor: 'c2' } }
          : { body: { results: [page('p2', 'B'), { ...page('p3', 'gone'), in_trash: true }], has_more: false } }),
      },
      calls,
    ),
  });
  const { rows } = await fetchTable(client, config);
  assert.deepEqual(rows.map((r) => r.title), ['A', 'B']);
  assert.deepEqual(rows[0].offeringIds, ['off-1']);
  assert.equal(rows[0].description, 'وصف');
  assert.equal(calls[2].body.start_cursor, 'c2');
  assert.equal(calls[0].headers['Notion-Version'], '2026-03-11');
});

test('pages through relations with more than 25 links', async () => {
  const big = page('p1', 'A', { Offering: { id: 'rel1', type: 'relation', relation: [{ id: 'x' }], has_more: true } });
  let n = 0;
  const client = createNotionClient({
    token: 't',
    version: 'v',
    fetchImpl: fakeFetch({
      'GET /databases/db1': { body: { data_sources: [{ id: 'ds1' }] } },
      'POST /data_sources/ds1/query': { body: { results: [big], has_more: false } },
      'GET /pages/p1/properties/rel1': () => (++n === 1
        ? { body: { results: [{ relation: { id: 'o1' } }, { relation: { id: 'o2' } }], has_more: true, next_cursor: 'k' } }
        : { body: { results: [{ relation: { id: 'o3' } }], has_more: false } }),
    }),
  });
  const { rows } = await fetchTable(client, config);
  assert.deepEqual(rows[0].offeringIds, ['o1', 'o2', 'o3']);
});

test('retries on rate limit, then succeeds', async () => {
  let attempts = 0;
  const client = createNotionClient({
    token: 't',
    version: 'v',
    sleep: async () => {},
    fetchImpl: fakeFetch({ 'GET /users/me': () => (++attempts < 3 ? { status: 429, headers: { 'retry-after': '1' }, body: {} } : { body: { ok: true } }) }),
  });
  assert.deepEqual(await client.request('GET', '/users/me'), { ok: true });
  assert.equal(attempts, 3);
});

test('surfaces "not shared" as a NotionError with status 404', async () => {
  const client = createNotionClient({ token: 't', version: 'v', fetchImpl: fakeFetch({}) });
  await assert.rejects(client.request('GET', '/databases/zzz'), (e) => e instanceof NotionError && e.status === 404 && e.code === 'object_not_found');
});

test('refuses to run without a token', () => {
  assert.throws(() => createNotionClient({ token: '', version: 'v' }), /setup-notion-token/);
});
