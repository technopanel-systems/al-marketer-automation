import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotion, englishPart, arabicPart } from '../../engine/catalog/merge.js';
import { validateCatalog } from '../../engine/catalog/validate.js';
import { sampleCatalog } from './fixtures.js';

const source = { aliases: { services: { 'media buying': 'svc.website' }, offerings: {}, deliverables: {} } };
const svcRow = (pageId, title, extra = {}) => ({ pageId, title, description: '', capability: 5, serviceIds: [], offeringIds: [], ...extra });
const row = (pageId, title, extra = {}) => ({ pageId, title, description: '', serviceIds: [], offeringIds: [], ...extra });

function notionFor() {
  return {
    services: {
      rows: [
        svcRow('p-portfolio', 'إدارة محفظة المنتجات (Product Portfolio Management)'),
        svcRow('p-brand', 'إدارة البراند (Brand Management)', { description: 'وصف البراند', capability: 4 }),
        svcRow('p-marketing', 'إدارة التسويق (Marketing Management)'),
        svcRow('p-website', 'الدعاية الممولة (Media Buying)', { capability: 2 }),
      ],
    },
    offerings: { rows: [row('p-seo', 'SEO', { serviceIds: ['p-website'] })] },
    deliverables: {
      rows: [
        row('p-ms', 'master_sheet', { serviceIds: ['p-portfolio'] }),
        row('p-bb', 'brand_book', { serviceIds: ['p-brand'] }),
        row('p-loy', 'loyalty', { serviceIds: ['p-brand'] }),
        row('p-sm', 'strategy_map', { serviceIds: ['p-marketing'] }),
        row('p-sp', 'seo_plan', { offeringIds: ['p-seo'] }),
        row('p-si', 'seo_implementation', { offeringIds: ['p-seo'] }),
      ],
    },
  };
}

test('splits Notion titles into English and Arabic parts', () => {
  assert.equal(englishPart('إدارة البراند (Brand Management)'), 'Brand Management');
  assert.equal(englishPart('SEO Plan'), 'SEO Plan');
  assert.equal(arabicPart('إدارة البراند (Brand Management)'), 'إدارة البراند');
  assert.equal(arabicPart('SEO Plan'), '');
});

test('matches by name and alias, fills Notion-owned fields, keeps local fields', () => {
  const { catalog, problems } = mergeNotion(sampleCatalog(), notionFor(), source);
  assert.deepEqual(problems, []);
  const brand = catalog.services.find((s) => s.id === 'svc.brand');
  assert.equal(brand.notionPageId, 'p-brand');
  assert.equal(brand.descriptionAr, 'وصف البراند');
  assert.equal(brand.capability, 4);
  assert.equal(brand.strategic, true, 'strategic flag is local');
  const website = catalog.services.find((s) => s.id === 'svc.website');
  assert.equal(website.notionName, 'الدعاية الممولة (Media Buying)', 'alias matched');
  assert.equal(website.nameEn, 'Website Management', 'display name is not replaced by an aliased Notion name');
  assert.equal(catalog.deliverables.find((d) => d.id === 'del.loyalty').kind, 'conditional', 'kind is local');
  assert.deepEqual(validateCatalog(catalog).errors, []);
});

test('second pull follows a Notion rename only when the display name was never overridden', () => {
  const first = mergeNotion(sampleCatalog(), notionFor(), source).catalog;
  const renamed = notionFor();
  renamed.deliverables.rows.find((r) => r.pageId === 'p-sp').title = 'SEO Plan v2';
  renamed.services.rows.find((r) => r.pageId === 'p-website').title = 'Websites (Web Management)';
  const { catalog, changes } = mergeNotion(first, renamed, source);
  assert.equal(catalog.deliverables.find((d) => d.id === 'del.seo_plan').nameEn, 'SEO Plan v2');
  assert.equal(catalog.services.find((s) => s.id === 'svc.website').nameEn, 'Website Management', 'locally overridden name kept');
  assert.ok(changes.some((c) => c.id === 'del.seo_plan' && c.field === 'nameEn'));
});

test('new Notion items get stable ids and are flagged; removed items are deactivated', () => {
  const first = mergeNotion(sampleCatalog(), notionFor(), source).catalog;
  const next = notionFor();
  next.deliverables.rows = next.deliverables.rows.filter((r) => r.pageId !== 'p-si');
  next.deliverables.rows.push(row('p-new', 'SEO Audit Report', { offeringIds: ['p-seo'] }));
  const { catalog, problems } = mergeNotion(first, next, source);
  const added = catalog.deliverables.find((d) => d.notionPageId === 'p-new');
  assert.equal(added.id, 'del.seo_audit_report');
  assert.equal(added.parentId, 'off.seo');
  assert.equal(added.stage, '', 'stage must be filled in by a person');
  assert.ok(problems.some((p) => p.includes('needs kind and stage')));
  assert.equal(catalog.deliverables.find((d) => d.id === 'del.seo_implementation').active, false);
  assert.ok(validateCatalog(catalog).errors.length > 0, 'incomplete new item blocks saving');
});

test('parent links follow Notion relations', () => {
  const moved = notionFor();
  moved.offerings.rows.push(row('p-ads', 'Ads', { serviceIds: ['p-website'] }));
  moved.deliverables.rows.find((r) => r.pageId === 'p-si').offeringIds = ['p-ads'];
  const { catalog } = mergeNotion(sampleCatalog(), moved, source);
  assert.equal(catalog.deliverables.find((d) => d.id === 'del.seo_implementation').parentId, 'off.ads');
});
