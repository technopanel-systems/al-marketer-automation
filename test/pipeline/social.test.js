// Social media audit pipeline: competitors, profiles, capture tasks, scorecard → evidence checks. No network: collectors are fakes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'alm-social-'));
process.env.ALM_CLIENTS_DIR = root;
const { clientPaths, load, addTextSource, loadSources, loadChecks, sourceText } = await import('../../pipeline/client.js');
const { createClient } = await import('../../pipeline/cli.js');
const social = await import('../../pipeline/social.js');
const { inputFingerprint } = await import('../../pipeline/steps.js');
const { hashOf } = await import('../../engine/util/data.js');
const { classifySocialUrl } = await import('../../collect/social.js');
const { profileRoot } = social;

const now = new Date('2026-09-14T12:00:00Z');
const daysAgo = (d) => new Date(now.getTime() - d * 86_400_000).toISOString();
const intake = {
  name: 'Technopanel',
  website: 'https://technopanel.com.sa',
  market: 'Saudi Arabia',
  industry: 'manufacturing',
  socials: ['https://www.linkedin.com/in/jeromyoussef', 'https://www.linkedin.com/company/technopanelco/', 'https://www.tiktok.com/@technopanelco'],
  competitors: 'Alucopanel | alucopanel.com | https://www.linkedin.com/company/alucopanel\nhttps://www.tiktok.com/@cladco',
};
let p;
before(() => {
  createClient({ slug: 'soc', name: intake.name, website: intake.website, socials: intake.socials, market: intake.market });
  p = clientPaths('soc');
});
after(() => rmSync(root, { recursive: true, force: true }));

test('team competitors are confirmed; AI proposals are deduplicated, exclude the client, and wait for review', () => {
  const doc = social.syncTeamCompetitors(p, intake);
  assert.deepEqual(doc.list.map((c) => [c.name, c.status, c.source]), [['Alucopanel', 'confirmed', 'team'], ['cladco', 'confirmed', 'team']]);
  const added = social.addAiCompetitors(p, [
    { name: 'ALUCOPANEL', website: 'https://www.alucopanel.com', socials: [], reason: 'same' },
    { name: 'Technopanel copy', website: 'https://technopanel.com.sa/about', socials: [], reason: 'is the client' },
    { name: 'Gulf Cladding', website: 'https://gulfcladding.sa', socials: ['https://www.instagram.com/gulfcladding', 'https://example.com/not-social'], reason: 'ACP supplier in Riyadh' },
  ], { clientWebsite: intake.website });
  assert.equal(added, 1);
  const proposed = social.loadCompetitors(p).list.find((c) => c.source === 'ai');
  assert.equal(proposed.status, 'proposed');
  assert.deepEqual(proposed.socials, ['https://www.instagram.com/gulfcladding']);
  assert.equal(social.socialTasks(p, intake).competitorsToReview, 1);
  assert.equal(social.socialTasks(p, intake).needsInput, true);
  social.saveCompetitorReview(p, { decisions: { [proposed.id]: { status: 'rejected' } }, add: { name: 'Riyadh ACP', website: 'riyadhacp.com', socials: 'linkedin.com/company/riyadh-acp' } });
  const after = social.loadCompetitors(p);
  assert.equal(after.reviewed, true);
  assert.equal(after.list.find((c) => c.name === 'Riyadh ACP').socials[0], 'https://linkedin.com/company/riyadh-acp');
});

test('profiles: a LinkedIn company page wins over a personal profile; the team can add a missing profile', () => {
  const profiles = social.brandProfiles(p, intake);
  assert.equal(profiles.client.linkedin, 'https://www.linkedin.com/company/technopanelco');
  assert.equal(profiles.client.tiktok, 'https://www.tiktok.com/@technopanelco');
  assert.ok(social.setBrandProfile(p, 'client', 'instagram.com/technopanelco'));
  assert.equal(social.brandProfiles(p, intake).client.instagram, 'https://instagram.com/technopanelco');
  assert.equal(social.setBrandProfile(p, 'client', 'https://example.com/x'), null);
});

test('capture methods: every platform but Snapchat is automatic without a login; the research browser is an opt-in fallback', () => {
  for (const pl of ['tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'instagram']) assert.equal(social.captureMethod(pl, {}), 'auto', pl);
  assert.equal(social.captureMethod('snapchat', {}), 'manual');
  assert.equal(social.captureMethod('linkedin', { ALM_SOCIAL_ASSISTED: '1' }), 'assisted');
  assert.equal(social.captureMethod('tiktok', { ALM_SOCIAL_ASSISTED: '1' }), 'auto');
  for (const pl of ['tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'instagram']) assert.equal(typeof social.defaultCollectors[pl], 'function', pl);
});

test('the social step captures automatically, lists what needs a person, and turns captures into evidence and checks', async () => {
  const ASSISTED = { ALM_SOCIAL_ASSISTED: '1' };
  const tiktok = async (url) => ({ platform: 'tiktok', url, method: 'auto: fake', status: 'ok', capturedAt: now.toISOString(), limit: 30, profile: { followers: 460 }, posts: [{ id: 'v1', date: daysAgo(66), type: 'video', caption: 'هناك مشاريع لا تحتاج إلى مبالغة في الوصف', likes: 10, comments: 1, shares: 2, views: 500 }] });
  const failing = async () => {
    throw new Error('blocked');
  };
  const discovered = [];
  const run = () => social.runSocialStep(p, intake, { env: ASSISTED, paceMs: 0, collectors: { tiktok, youtube: failing, instagram: failing }, discover: async (site) => (discovered.push(site), []), now });
  let r = await run();
  assert.ok(discovered.includes('https://alucopanel.com'), 'competitor websites are searched for social links once');
  const tasks = social.socialTasks(p, intake, ASSISTED);
  const byKey = Object.fromEntries(tasks.tasks.map((t) => [`${t.brandId}:${t.platform}`, t]));
  assert.equal(byKey['client:tiktok'].state, 'captured');
  assert.equal(byKey['client:linkedin'].state, 'todo');
  assert.equal(byKey['client:linkedin'].method, 'assisted');
  assert.equal(r.needsInput, true, 'LinkedIn and Instagram captures need a person');

  const card = load(p.scorecard);
  const tt = card.platforms.find((x) => x.platform === 'tiktok');
  assert.equal(tt.rows.find((row) => row.brandId === 'client').metrics.status, 'inactive');
  const checks = loadChecks(p);
  const cadence = checks.find((c) => c.key === 'social:client:tiktok:cadence');
  assert.ok(cadence && /K\d{3}/.test(cadence.id));
  assert.match(cadence.value, /last post 66 days ago/);
  const src = loadSources(p).find((s) => s.kind === 'social-data' && s.platform === 'tiktok');
  assert.ok(src, 'captured posts become quotable evidence');

  // The team captures LinkedIn (assisted) and marks the other profiles; the step then has nothing left to ask.
  social.saveCapture(p, { brandId: 'client', brandName: 'Technopanel', role: 'client', platform: 'linkedin', url: 'https://www.linkedin.com/company/technopanelco', method: 'assisted (research browser)', status: 'ok', capturedAt: now.toISOString(), profile: { followers: 2093 }, posts: [{ id: '1', date: daysAgo(12), type: 'image', likes: 20, comments: 2, shares: 0 }] });
  for (const t of social.socialTasks(p, intake, ASSISTED).tasks.filter((x) => x.state === 'todo' || x.state === 'failed')) social.setTaskStatus(p, t.brandId, t.platform, t.brandId === 'client' ? 'skipped' : 'not_found');
  const sourcesBefore = loadSources(p).length;
  r = await run();
  assert.equal(r.needsInput, false, JSON.stringify(social.socialTasks(p, intake, ASSISTED).tasks.filter((x) => ['todo', 'failed'].includes(x.state))));
  assert.equal(loadSources(p).length, sourcesBefore + 1, 'only the new LinkedIn capture adds evidence; re-runs update, not duplicate');
  assert.ok(loadChecks(p).some((c) => c.key === 'social:client:linkedin:followers' && c.value === '2,093'));

  // Rejecting a competitor removes its checks from the evidence.
  const alu = social.loadCompetitors(p).list.find((c) => c.name === 'Alucopanel');
  assert.ok(loadChecks(p).some((c) => c.key.startsWith(`social:${alu.id}:`)));
  social.saveCompetitorReview(p, { decisions: { [alu.id]: { status: 'rejected' } } });
  await run();
  assert.equal(loadChecks(p).some((c) => c.key.startsWith(`social:${alu.id}:`)), false);
});

test('captured social posts do not make the client record out of date', () => {
  const ctx = { status: { steps: {} } };
  const beforeHash = hashOf(inputFingerprint(p, 'record', ctx));
  addTextSource(p, { kind: 'social-data', platform: 'x', url: 'https://x.com/technopanels', title: 'x', text: 'POST 2026-09-01' });
  assert.equal(hashOf(inputFingerprint(p, 'record', ctx)), beforeHash);
  addTextSource(p, { kind: 'human', title: 'answer', text: 'new team answer' });
  assert.notEqual(hashOf(inputFingerprint(p, 'record', ctx)), beforeHash, 'other new evidence still does');
});

test('profile links are cut back to the profile itself, and Facebook numeric profiles keep their id', () => {
  assert.equal(profileRoot('linkedin', 'https://www.linkedin.com/company/samman-aluminum-works/posts'), 'https://www.linkedin.com/company/samman-aluminum-works');
  assert.equal(profileRoot('linkedin', 'https://www.linkedin.com/company/star-panel'), 'https://www.linkedin.com/company/star-panel');
  assert.equal(profileRoot('tiktok', 'https://www.tiktok.com/@brand/video/7400000000000000000'), 'https://www.tiktok.com/@brand');
  assert.equal(profileRoot('x', 'https://x.com/star_panel1/status/123'), 'https://x.com/star_panel1');
  assert.equal(profileRoot('youtube', 'https://www.youtube.com/channel/UC123/videos'), 'https://www.youtube.com/channel/UC123');
  assert.equal(profileRoot('facebook', 'https://www.facebook.com/pages/Brand/12345/about'), 'https://www.facebook.com/pages/Brand/12345');
  assert.equal(classifySocialUrl('https://www.facebook.com/profile.php?id=100064&sk=about').url, 'https://www.facebook.com/profile.php?id=100064');
  assert.equal(profileRoot('facebook', 'https://www.facebook.com/profile.php?id=100064'), 'https://www.facebook.com/profile.php?id=100064');
});

test('skipping or marking absent an already captured profile removes its numbers and posts from the evidence', async () => {
  const run = () => social.runSocialStep(p, intake, { env: { ALM_SOCIAL_ASSISTED: '1' }, paceMs: 0, collectors: { tiktok: async () => { throw new Error('not called'); } }, discover: async () => [], now });
  social.setTaskStatus(p, 'client', 'linkedin', null);
  await run();
  const liSource = loadSources(p).find((s) => s.kind === 'social-data' && s.url === 'https://www.linkedin.com/company/technopanelco');
  assert.ok(liSource, 'the LinkedIn capture is evidence while it is in the scorecard');
  assert.ok(loadChecks(p).some((c) => c.key === 'social:client:linkedin:followers'));

  social.setTaskStatus(p, 'client', 'linkedin', 'skipped');
  await run();
  assert.equal(loadSources(p).some((s) => s.id === liSource.id), false, 'the posts are no longer quotable');
  assert.equal(sourceText(p, liSource.id), null);
  assert.equal(loadChecks(p).some((c) => c.key.startsWith('social:client:linkedin:')), false, 'the numbers are no longer citable');
  const row = load(p.scorecard).platforms.find((x) => x.platform === 'linkedin').rows.find((r) => r.brandId === 'client');
  assert.equal(row.state, 'skipped');
  assert.equal(row.metrics, null);
});
