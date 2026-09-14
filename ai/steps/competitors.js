// Proposes direct competitors (Sonnet + web search for discovery). The team confirms or rejects every proposal
// before anything is captured or compared; nothing the AI proposes is used as evidence by itself.
import { runAiStep } from '../runner.js';
import { SYSTEM } from '../prompts.js';
import { recordText } from '../../pipeline/steps/record.js';
import { load, save } from '../../pipeline/client.js';
import { classifySocialUrl } from '../../collect/social.js';
import { addAiCompetitors, loadCompetitors, syncTeamCompetitors, domainOf } from '../../pipeline/social.js';

export const competitorsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['competitors'],
  properties: {
    competitors: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'website', 'socials', 'reason', 'confidence'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 80 },
          website: { type: 'string', maxLength: 200, description: 'Official website, or empty if not sure' },
          socials: { type: 'array', maxItems: 7, items: { type: 'string', maxLength: 200 }, description: 'Official profile URLs only (LinkedIn company page, Instagram, TikTok, Facebook, X, YouTube, Snapchat)' },
          reason: { type: 'string', minLength: 10, maxLength: 240, description: 'One sentence: what they sell and where, and why they compete with this client' },
          confidence: { enum: ['high', 'medium'] },
        },
      },
    },
  },
};

export async function runCompetitorsStep(p, intake, { logFile } = {}) {
  syncTeamCompetitors(p, intake);
  const known = loadCompetitors(p).list;
  const record = load(p.record, { sections: {} });
  const prompt = `<task>
Find up to 4 DIRECT competitors of the client below: companies that sell the same kind of products or services to the same kind of customers in the same market (${intake.market || 'the client market'}).
- Use WebSearch to find them and to find their official website and official social media profiles.
- Prefer competitors that are active on social media, especially ${intake.industry === 'manufacturing' ? 'LinkedIn' : 'Instagram, TikTok and Snapchat'}.
- Only include a website or profile URL when you are confident it is the official one for that exact company (same name AND same country/products). When unsure, leave it out — the team fills gaps.
- Do not include the client itself, marketplaces, directories, or companies already known below.
- Search results are for discovery only; the team will confirm every competitor before anything is compared.
</task>

<client name="${intake.name}" website="${intake.website || ''}" market="${intake.market || ''}" industry="${intake.industry || 'general'}">
${recordText(record).split('\n').slice(0, 60).join('\n')}
</client>

<already_known_competitors>
${known.map((c) => `- ${c.name}${c.website ? ` (${c.website})` : ''}`).join('\n') || 'none'}
</already_known_competitors>`;

  const { output } = await runAiStep({ step: 'competitors', model: 'sonnet', effort: 'low', systemPrompt: SYSTEM.competitors, prompt, schema: competitorsSchema, tools: ['WebSearch'], logFile, requestsDir: p.aiRequestsDir });
  const clean = output.competitors.map((c) => ({
    name: c.name.trim(),
    website: /^https?:\/\//i.test(c.website) && domainOf(c.website) ? c.website.trim() : '',
    socials: [...new Set(c.socials.map((u) => classifySocialUrl(u)?.url).filter(Boolean))],
    reason: c.reason.trim(),
    confidence: c.confidence,
  }));
  save(p.competitorsAi, { proposals: clean, createdAt: new Date().toISOString() });
  const added = addAiCompetitors(p, clean, { clientWebsite: intake.website });
  return { proposed: clean.length, added };
}
