// Creates the three catalog databases (Services, Offerings, Deliverables) in the Notion workspace the token
// belongs to, fills them from the local catalog, and points catalog/notion-source.json at them.
// Use it to (re)create the Notion editing surface in any workspace, e.g. when moving to a company workspace.
import { sortRows } from './model.js';

const rt = (text) => [{ type: 'text', text: { content: String(text ?? '').slice(0, 2000) } }];

export async function findParentPage(client, explicitParentId) {
  if (explicitParentId) return { type: 'page_id', page_id: explicitParentId };
  const res = await client.request('POST', '/search', { page_size: 50, filter: { property: 'object', value: 'page' } });
  const page = (res.results || []).find((p) => !p.in_trash);
  if (!page) throw new Error('The Notion connection cannot see any page to create the catalog under. Share one page with the connection first.');
  return { type: 'page_id', page_id: page.id };
}

async function createContainer(client, parent) {
  // Prefer a top-level page; fall back to a child of an accessible page (internal connections may not create workspace pages).
  const body = (p) => ({
    parent: p,
    properties: { title: { title: rt('Al-Marketer — Service Catalog') } },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: rt('Editing surface for the proposal system catalog. The system copies these databases into its local catalog with "npm run catalog:pull-notion". Do not delete the "Stable ID" column.'),
        },
      },
    ],
  });
  try {
    return await client.request('POST', '/pages', body({ type: 'workspace', workspace: true }));
  } catch {
    return client.request('POST', '/pages', body(parent));
  }
}

async function createDatabase(client, parentPageId, title, properties) {
  const db = await client.request('POST', '/databases', {
    parent: { type: 'page_id', page_id: parentPageId },
    title: rt(title),
    initial_data_source: { properties },
  });
  const dataSourceId = db.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error(`Notion did not return a data source for "${title}"`);
  return { databaseId: db.id, dataSourceId };
}

const relation = (dataSourceId) => ({ relation: { data_source_id: dataSourceId, type: 'single_property', single_property: {} } });

export async function bootstrapNotion(client, catalog, { parentPageId, log = () => {} } = {}) {
  const parent = await findParentPage(client, parentPageId);
  const container = await createContainer(client, parent);
  log(`Created page "Al-Marketer — Service Catalog" (${container.id})`);

  const services = await createDatabase(client, container.id, 'Services', {
    Service: { title: {} },
    'Stable ID': { rich_text: {} },
    Description: { rich_text: {} },
    'Capability (0>5)': { number: { format: 'number' } },
  });
  const offerings = await createDatabase(client, container.id, 'Offerings', {
    Offering: { title: {} },
    'Stable ID': { rich_text: {} },
    Description: { rich_text: {} },
    Service: relation(services.dataSourceId),
  });
  const deliverables = await createDatabase(client, container.id, 'Deliverables', {
    Deliverable: { title: {} },
    'Stable ID': { rich_text: {} },
    Description: { rich_text: {} },
    Offering: relation(offerings.dataSourceId),
    Service: relation(services.dataSourceId),
  });
  log('Created databases Services, Offerings, Deliverables');

  const pageIds = new Map();
  const createRow = async (dataSourceId, properties) => (await client.request('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties })).id;

  for (const s of sortRows(catalog.services.filter((r) => r.active))) {
    pageIds.set(
      s.id,
      await createRow(services.dataSourceId, {
        Service: { title: rt(`${s.nameAr} (${s.nameEn})`) },
        'Stable ID': { rich_text: rt(s.id) },
        Description: { rich_text: rt(s.descriptionAr) },
        'Capability (0>5)': { number: s.capability },
      }),
    );
  }
  for (const o of sortRows(catalog.offerings.filter((r) => r.active))) {
    pageIds.set(
      o.id,
      await createRow(offerings.dataSourceId, {
        Offering: { title: rt(o.nameEn) },
        'Stable ID': { rich_text: rt(o.id) },
        Description: { rich_text: rt(o.descriptionAr) },
        Service: { relation: [{ id: pageIds.get(o.serviceId) }] },
      }),
    );
  }
  for (const d of sortRows(catalog.deliverables.filter((r) => r.active))) {
    const parentIsOffering = d.parentId.startsWith('off.');
    pageIds.set(
      d.id,
      await createRow(deliverables.dataSourceId, {
        Deliverable: { title: rt(d.nameEn) },
        'Stable ID': { rich_text: rt(d.id) },
        Description: { rich_text: rt(d.descriptionAr) },
        Offering: { relation: parentIsOffering ? [{ id: pageIds.get(d.parentId) }] : [] },
        Service: { relation: parentIsOffering ? [] : [{ id: pageIds.get(d.parentId) }] },
      }),
    );
  }
  log(`Created ${pageIds.size} rows`);

  return {
    containerPageId: container.id,
    containerUrl: container.url,
    databases: {
      services: { databaseId: services.databaseId, titleProperty: 'Service', descriptionProperty: 'Description', capabilityProperty: 'Capability (0>5)', stableIdProperty: 'Stable ID' },
      offerings: { databaseId: offerings.databaseId, titleProperty: 'Offering', descriptionProperty: 'Description', serviceRelation: 'Service', stableIdProperty: 'Stable ID' },
      deliverables: { databaseId: deliverables.databaseId, titleProperty: 'Deliverable', descriptionProperty: 'Description', offeringRelation: 'Offering', serviceRelation: 'Service', stableIdProperty: 'Stable ID' },
    },
  };
}
