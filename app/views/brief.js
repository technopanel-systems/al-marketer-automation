// The brief: the few things a person gives the system (new proposal form, and editing an existing one).
import { existsSync, readFileSync } from 'node:fs';
import { esc, attr } from '../ui/html.js';
import { pageHeader, field, select, button, note, section } from '../ui/components.js';
import { loadBenchmarks } from '../../pipeline/social.js';

const industryOptions = () => Object.entries(loadBenchmarks().industries).map(([k, v]) => [k, v.en]);

function briefFields(intake = {}, notes = '', { isNew = false } = {}) {
  return `<div class="form-grid">
  <div class="form-col">
    <fieldset class="group"><legend>Client</legend>
      ${field('Client name', `<input type="text" name="name" value="${attr(intake.name || '')}" required dir="auto" autocomplete="off"${isNew ? ' autofocus' : ' readonly'}>`, { help: isNew ? 'As the client writes it, Arabic or English.' : 'The name cannot be changed after creation.' })}
      ${field('Name on the cover', `<input type="text" name="displayName" value="${attr(intake.displayName && intake.displayName !== intake.name ? intake.displayName : '')}" dir="auto">`, { help: 'Leave empty to use the client name.' })}
      ${field('Presented to', `<input type="text" name="presentedTo" value="${attr(intake.presentedTo && intake.presentedTo !== intake.name ? intake.presentedTo : '')}" dir="auto">`, { help: 'The person the proposal is addressed to, e.g. م. سامح' })}
    </fieldset>
    <fieldset class="group"><legend>Online presence</legend>
      ${field('Website', `<input type="url" name="website" value="${attr(intake.website || '')}" inputmode="url" placeholder="https://">`)}
      ${field('Social links', `<textarea name="socials" rows="4" placeholder="One link per line">${esc((intake.socials || []).join('\n'))}</textarea>`, { help: 'Company pages on LinkedIn, Instagram, TikTok, Facebook, X, YouTube, Snapchat. More are found on the website automatically.' })}
    </fieldset>
    <fieldset class="group"><legend>Market</legend>
      <div class="field-row">
        ${field('Market or country', `<input type="text" name="market" value="${attr(intake.market || '')}" placeholder="e.g. Saudi Arabia">`)}
        ${field('Industry', select('industry', industryOptions(), intake.industry || 'general'), { help: 'Sets the social media reference ranges.' })}
      </div>
      ${field('Competitors you already know', `<textarea name="competitors" rows="3" dir="auto" placeholder="Name | website | profile link, one per line">${esc(intake.competitors || '')}</textarea>`, { help: 'Optional. The AI also looks for competitors; you confirm its suggestions.' })}
      ${field('Known constraints', `<textarea name="constraints" rows="3" dir="auto">${esc(intake.constraints || '')}</textarea>`, { help: 'Anything the proposal must respect, e.g. budget limits or two brand names.' })}
    </fieldset>
  </div>
  <div class="form-col">
    <fieldset class="group group-grow">
      ${field('Meeting notes', `<textarea name="notes" class="notes" dir="auto" rows="18">${esc(notes)}</textarea>`, { help: 'Goals, products, budget, what they tried, anything the client said. Arabic or English.' })}
    </fieldset>
  </div>
</div>`;
}

export function newClient({ msg = '', values = {} } = {}) {
  return `${pageHeader({ title: 'New proposal', meta: 'Only the minimum. The system researches the website, social media and competitors on its own.' })}
  ${msg}
  <form method="post" action="/new" class="form-page" data-track-dirty>
    ${briefFields(values, values.notes || '', { isNew: true })}
    <div class="form-actions">${button('Create and start research', { name: '', kind: 'primary', iconName: 'arrow-right' })}<a class="btn btn-quiet" href="/">Cancel</a></div>
  </form>`;
}

export function briefPage({ slug, p, intake }) {
  const notes = existsSync(p.notes) ? readFileSync(p.notes, 'utf8') : '';
  return section({
    title: 'Brief',
    intro: 'Changing the website, social links or notes marks the research that used them as out of date; it runs again on its own and later approvals re-open.',
    body: `<form method="post" action="/c/${attr(slug)}/brief" data-track-dirty>${briefFields(intake, notes)}
      <div class="form-actions">${button('Save brief', { name: '', kind: 'primary' })}</div></form>`,
  });
}

export const briefFromForm = (b, intake = {}) => ({
  ...intake,
  name: intake.name || (b.get('name') || '').trim(),
  displayName: (b.get('displayName') || '').trim() || intake.name || (b.get('name') || '').trim(),
  presentedTo: (b.get('presentedTo') || '').trim() || intake.name || (b.get('name') || '').trim(),
  website: (b.get('website') || '').trim(),
  socials: (b.get('socials') || '').split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(s)).map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`)),
  market: (b.get('market') || '').trim(),
  industry: b.get('industry') || 'general',
  competitors: b.get('competitors') || '',
  constraints: b.get('constraints') || '',
});

export { note };
