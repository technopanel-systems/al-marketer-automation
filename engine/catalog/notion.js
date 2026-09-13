// Minimal client for the official Notion API — used only by the catalog pull command.
// Read-only calls: retrieve database, query data source, retrieve paginated relation property.

const API = 'https://api.notion.com/v1';

export class NotionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createNotionClient({ token, version, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new NotionError(0, 'missing_token', 'NOTION_TOKEN is not set. Double-click setup-notion-token.cmd and paste the token.');

  async function request(method, path, body) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': version,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 5) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      let payload = {};
      try {
        payload = await res.json();
      } catch {
        // non-JSON error body
      }
      throw new NotionError(res.status, payload.code || 'http_error', payload.message || `Notion API returned HTTP ${res.status}`);
    }
  }

  return { request };
}

export function plainText(richText) {
  return (richText || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
}

async function relationIds(client, page, propName) {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== 'relation') return [];
  const ids = (prop.relation || []).map((r) => r.id);
  if (!prop.has_more) return ids;
  // More than 25 related pages: page through the property item endpoint.
  const all = [];
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : '';
    const res = await client.request('GET', `/pages/${page.id}/properties/${prop.id}${qs}`);
    for (const item of res.results || []) if (item.relation?.id) all.push(item.relation.id);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

function propertyValue(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return undefined;
  switch (prop.type) {
    case 'title':
      return plainText(prop.title);
    case 'rich_text':
      return plainText(prop.rich_text);
    case 'number':
      return prop.number;
    case 'select':
      return prop.select?.name ?? null;
    default:
      return undefined;
  }
}

// Returns normalized rows: { pageId, title, description, capability, serviceIds, offeringIds }.
export async function fetchTable(client, dbConfig) {
  const db = await client.request('GET', `/databases/${dbConfig.databaseId}`);
  const sources = db.data_sources || [];
  if (sources.length === 0) throw new NotionError(0, 'no_data_source', `Notion database ${dbConfig.databaseId} has no data source`);
  const dataSourceId = sources[0].id;

  const pages = [];
  let cursor;
  do {
    const res = await client.request('POST', `/data_sources/${dataSourceId}/query`, cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 });
    pages.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const rows = [];
  for (const page of pages) {
    if (page.in_trash || page.archived) continue;
    rows.push({
      pageId: page.id,
      title: (propertyValue(page, dbConfig.titleProperty) ?? '').trim(),
      description: (propertyValue(page, dbConfig.descriptionProperty) ?? '').trim(),
      capability: dbConfig.capabilityProperty ? propertyValue(page, dbConfig.capabilityProperty) ?? null : undefined,
      serviceIds: dbConfig.serviceRelation ? await relationIds(client, page, dbConfig.serviceRelation) : [],
      offeringIds: dbConfig.offeringRelation ? await relationIds(client, page, dbConfig.offeringRelation) : [],
    });
  }
  return { dataSourceId, extraDataSources: sources.length - 1, rows };
}

export async function fetchNotionCatalog(client, source) {
  const out = {};
  for (const table of ['services', 'offerings', 'deliverables']) {
    out[table] = await fetchTable(client, source.databases[table]);
  }
  return out;
}
