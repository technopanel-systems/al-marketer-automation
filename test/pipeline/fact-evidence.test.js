// Gate 3 fact check: statements are shown with the evidence they cite, and suspicious ones are flagged.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-facts-'));
process.env.ALM_CLIENTS_DIR = root;
const { clientPaths, addTextSource, save } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const { factEvidence, factStatements } = await import('../../pipeline/fact-evidence.js');

let p;
let home;
let contact;
before(() => {
  createClient({ slug: 'facts', name: 'Test' });
  p = clientPaths('facts');
  home = addTextSource(p, { kind: 'website', url: 'https://example.com/', title: 'Home', text: 'Free Shipping for orders above LE 5000. DELIVERY WITHIN 1-2 DAYS IN CAIRO-GIZA.' });
  contact = addTextSource(p, { kind: 'website', url: 'https://example.com/contact', title: 'Contact', text: 'Cairo branch: 01002805561\nGiza branch: 01030380433\nZagazig branch: 01009890199\nMansoura branch: 01025901124' });
  const fact = (id, value, quote) => ({ field: 'x', value, quote, evidenceId: id, confidence: 'high' });
  save(p.record, {
    sections: {
      business: {
        sales_channels: [fact(home.id, 'توصيل خلال 1-2 يوم للقاهرة والجيزة', 'DELIVERY WITHIN 1-2 DAYS IN CAIRO-GIZA'), fact(home.id, 'شحن مجاني للطلبات فوق 5000 جنيه', 'Free Shipping for orders above LE 5000')],
        locations: [fact(contact.id, 'فروع في القاهرة والجيزة والزقازيق والمنصورة', 'Cairo branch')],
      },
      brand: {},
      channels: {},
    },
  });
});
after(() => rmSync(root, { recursive: true, force: true }));

test('finds every statement that cites evidence, wherever it sits in the content', () => {
  const st = factStatements({ business: { cards: [{ title: 'a', text: 'b', basedOn: ['E001'] }] }, brand: { stats: [{ value: '10K', text: 'x', basedOn: [] }] }, _meta: { basedOn: ['E9'] } });
  assert.deepEqual(st.map((s) => s.path), ['business.cards[0]', 'brand.stats[0]']);
});

test('shows the evidence line for each claim in a statement, and flags numbers its evidence does not contain', () => {
  const content = {
    business: {
      cards: [
        { title: 'توصيل سريع', text: 'شحن مجاني لكل الطلبات، ومن 1 لـ2 يوم في القاهرة والجيزة.', basedOn: [home.id] },
        { title: 'فروع', text: 'العميلة تقدر تشتري من فروعهم الـ3 في الإسكندرية.', basedOn: [contact.id] },
        { title: 'مصدر مش موجود', text: 'نص', basedOn: ['E099'] },
      ],
    },
  };
  const [ship, branches, missing] = factEvidence(p, content);
  const shipLines = ship.evidence[0].lines.map((l) => `${l.text} ${l.quote}`).join(' | ');
  assert.match(shipLines, /فوق 5000/, 'the free-shipping condition must be shown next to a free-shipping claim');
  assert.match(shipLines, /1-2 يوم/);
  assert.ok(branches.flags.some((f) => f.code === 'number_not_in_evidence' && /3/.test(f.message)));
  assert.match(branches.evidence[0].lines.map((l) => l.text).join(' '), /الزقازيق/);
  assert.ok(missing.flags.some((f) => f.code === 'unknown_evidence'));
});
