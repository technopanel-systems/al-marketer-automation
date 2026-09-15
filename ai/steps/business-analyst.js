// Business analyst (Sonnet, no tools): reads the business signals code found (biz_* checks), the website and policy
// pages and the meeting notes, and writes cited facts about how the business works: who buys, how orders and leads
// are handled, payments, support, fulfilment, retention, reputation, scale and trust. Code verifies every quote.
// It never names services, suggests tools or vendors, estimates numbers or picks problem types.
import { runAiStep } from '../runner.js';
import { EVIDENCE_RULES } from '../prompts.js';
import { OPERATIONS } from '../fields.js';
import { evidencePacket, verifyCitation } from '../evidence.js';
import { load, save, loadChecks, checkText } from '../../pipeline/client.js';
import { join } from 'node:path';

export const BUSINESS_MODELS = ['b2c_ecommerce', 'd2c_brand', 'b2b_manufacturer_supplier', 'b2b_services', 'b2c_services_booking', 'retail_branches', 'food_beverage', 'marketplace_or_social_seller', 'mixed', 'unknown'];
export const OBSERVATION_KINDS = ['need', 'risk', 'strength'];
export const AFFECTS = ['lead_follow_up', 'order_conversion', 'cash_collection', 'delivery_experience', 'repeat_business', 'trust', 'scaling', 'market_expansion'];
export const OBSERVATION_AREAS = ['payments', 'fulfilment', 'compliance', 'crm_support', 'sales_process', 'retention', 'reputation', 'hiring_growth', 'markets', 'catalogue', 'apps', 'marketplaces'];
// Which measured checks can show that something is missing, per record field. "Not found" citing any other check is unknown.
export const FIELD_CHECKS = {
  customer_type: ['biz_b2b_indicators'],
  order_path: ['biz_online_checkout', 'biz_checkout_disabled', 'biz_quote_request'],
  payment_methods: ['biz_payment_methods', 'biz_bnpl', 'biz_cod'],
  pricing_visibility: ['biz_prices_visible', 'biz_quote_request'],
  lead_handling: ['biz_lead_form', 'biz_booking_tool', 'biz_whatsapp_path', 'biz_live_chat'],
  support_channels: ['biz_live_chat', 'biz_helpdesk', 'biz_whatsapp_path'],
  crm_and_tools: ['biz_crm_tools', 'biz_email_tools', 'biz_helpdesk'],
  fulfilment: ['biz_couriers', 'biz_returns_policy'],
  retention_mechanisms: ['biz_loyalty'],
  public_reputation: ['biz_onsite_reviews'],
  catalogue_scale: ['biz_catalog_size', 'biz_catalogue_pdf'],
  growth_signals: ['biz_hiring', 'biz_app_ios', 'biz_app_android'],
  markets_served: ['biz_languages'],
  trust_and_compliance: ['biz_vat_cr_shown', 'biz_sbc_badge', 'biz_returns_policy'],
  app_presence: ['biz_app_ios', 'biz_app_android'],
  marketplace_presence: ['biz_marketplaces'],
};

const cite = { type: 'object', additionalProperties: false, required: ['evidenceId', 'quote'], properties: { evidenceId: { type: 'string', pattern: '^[ENHK][0-9]{3}$' }, quote: { type: 'string', maxLength: 300 } } };

export const businessSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['businessModel', 'facts', 'observations', 'unknown'],
  properties: {
    businessModel: { type: 'object', additionalProperties: false, required: ['label', 'evidence', 'confidence'], properties: { label: { enum: BUSINESS_MODELS }, evidence: { type: 'array', maxItems: 5, items: cite }, confidence: { enum: ['high', 'medium', 'low'] } } },
    facts: { type: 'array', maxItems: 40, items: { type: 'object', additionalProperties: false, required: ['field', 'shows', 'value', 'evidenceId', 'quote', 'confidence'], properties: { field: { enum: Object.keys(OPERATIONS.fields) }, shows: { enum: ['found', 'not_found'] }, value: { type: 'string', minLength: 2, maxLength: 300 }, evidenceId: { type: 'string', pattern: '^[ENHK][0-9]{3}$' }, quote: { type: 'string', maxLength: 300 }, confidence: { enum: ['high', 'medium', 'low'] } } } },
    observations: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['kind', 'area', 'affects', 'text_en', 'text_ar', 'evidence'], properties: { kind: { enum: OBSERVATION_KINDS }, area: { enum: OBSERVATION_AREAS }, affects: { enum: AFFECTS }, text_en: { type: 'string', maxLength: 300 }, text_ar: { type: 'string', maxLength: 300 }, evidence: { type: 'array', minItems: 1, maxItems: 4, items: cite } } } },
    unknown: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['field', 'reason'], properties: { field: { type: 'string', maxLength: 40 }, reason: { type: 'string', maxLength: 200 } } } },
  },
};

export const BUSINESS_LENS = `<business_lens>
- Business type: online store, service or agency, B2B supplier or manufacturer, marketplace or social seller, subscription, local shop or branches, or a named mix. The main way it earns money decides the type.
- How a customer buys: count the steps from first contact to a paid order; name where it depends on a person replying (DM, WhatsApp, phone) or has no checkout.
- The core offer as observed: outcome or feature list, what is included, guarantee / return / exchange policy, delivery or response times, price and payment options — only as seen.
- Price transparency: prices as text, only in images, "DM for price", or "request a quote".
- Lead handling and support: forms, WhatsApp, live chat, booking, helpdesk and CRM tools — from checks only.
- Retention and reputation: loyalty, reviews shown on the site, follow-up after purchase.
- Scale and growth: number of products, branches, apps, hiring, markets and languages, age of the website.
- Trust: registration or VAT numbers shown, e-store authentication, policies.
</business_lens>`;

export const ANALYST_RULES = `<analyst_rules>
- Never name Al-Marketer services, offerings or deliverables, never suggest solutions, tools or vendors to buy.
- Never estimate revenue, orders, traffic, margins or employee counts; write no number that is not in a check or a quote.
- A fact is something the evidence shows (shows: "found"). Something missing is shows: "not_found" and must cite the check id (K###) that measured exactly that thing (for example the app checks for app_presence, the marketplace check for marketplace_presence), worded "not found on the pages and records checked", never "has no …". A page that simply does not mention something is not evidence of absence: put that field in unknown instead.
- Page quotes are 8–250 characters copied exactly; a one-word quote is rejected.
- Never judge legality or compliance; only restate what a check or page shows.
- No general market knowledge as a fact (for example what shoppers in a country prefer).
- Observations are the business needs, risks and strengths the evidence reveals, for Al-Marketer's team only (internal). Each names the kind (need, risk or strength), what it affects (lead follow-up, order conversion, cash collection, delivery experience, repeat business, trust, scaling, market expansion) and why, in one or two sentences. Do not restate a single fact; connect it to its business consequence. Example: "Every order starts with a quote form and no CRM or chat tool was detected, so follow-up speed depends on people answering by hand" (need, lead_follow_up).
- Include matters marketing services do not cover (payments setup, fulfilment, CRM choice, hiring, apps, marketplaces); they help the team prepare and are never sold from here.
- Do not pick problem types or severities; the diagnosis does that.
</analyst_rules>`;

export async function runBusinessAnalystStep(p, intake, { logFile } = {}) {
  const checks = loadChecks(p).filter((c) => /^(biz_|tech_|website_reachable|social_|seo_https)/.test(c.key));
  const packet = evidencePacket(p, { kinds: ['website', 'business', 'notes', 'human', 'file', 'requested'], totalChars: 45_000 }).text;
  const prompt = `${EVIDENCE_RULES}

${BUSINESS_LENS}

${ANALYST_RULES}

<task>
You are Al-Marketer's business analyst for the client "${intake.name}" (market: ${intake.market || 'not given'}, industry: ${intake.industry || 'general'}).
1. businessModel: pick the label that fits the evidence, with up to 5 citations; "unknown" when the evidence does not show it.
2. facts: one field + a short Arabic value + one citation each. Fields:
${Object.entries(OPERATIONS.fields).map(([k, v]) => `   ${k}: ${v}`).join('\n')}
3. observations: up to 8 internal business needs, risks or strengths, each in English and Arabic, with what it affects and citations.
4. unknown: fields the evidence does not cover, with a one-line reason.
</task>

<client name="${intake.name}" website="${intake.website || ''}" market="${intake.market || ''}" constraints="${String(intake.constraints || '').replace(/"/g, "'")}" />

<checks>
${checks.map(checkText).join('\n') || 'none'}
</checks>

${packet}`;

  const cache = new Map();
  const ok = (c) => verifyCitation(p, c, cache).ok;
  const check = (out) => {
    const all = [...out.facts, ...out.observations.flatMap((o) => o.evidence), ...out.businessModel.evidence];
    const bad = all.filter((c) => !ok(c));
    return all.length >= 4 && bad.length > all.length / 3 ? [`${bad.length} of ${all.length} citations failed verification. Copy quotes exactly from the evidence text, or cite a K### check id with an empty quote.`] : [];
  };
  const { output } = await runAiStep({ step: 'business-analyst', model: 'sonnet', effort: 'medium', systemPrompt: 'You are the business analyst at Al-Marketer, a marketing agency. You describe how a client business works strictly from evidence and return only the requested JSON.', prompt, schema: businessSchema, check, logFile, requestsDir: p.aiRequestsDir });

  // "Not found" is only a fact when a code check measured it; a page that does not mention something proves nothing.
  const keyOf = Object.fromEntries(loadChecks(p).map((c) => [c.id, c.key]));
  const unmeasured = (f) => f.shows === 'not_found' && !(FIELD_CHECKS[f.field] || []).includes(keyOf[f.evidenceId]);
  const facts = output.facts.filter((f) => !unmeasured(f) && ok(f)).map((f) => ({ ...f, source: 'business-analyst' }));
  const rejected = output.facts.filter((f) => !unmeasured(f) && !ok(f)).map((f) => ({ ...f, reason: verifyCitation(p, f, cache).reason }));
  const unknownAll = [...output.unknown, ...output.facts.filter(unmeasured).map((f) => ({ field: f.field, reason: 'not mentioned on the pages read; no check measured it' }))];
  const known = new Set(facts.map((f) => f.field));
  const unknown = unknownAll.filter((u, i) => !known.has(u.field) && unknownAll.findIndex((x) => x.field === u.field) === i);
  const observations = output.observations.map((o) => ({ ...o, evidence: o.evidence.filter(ok), internalOnly: true })).filter((o) => o.evidence.length);
  const modelEvidence = output.businessModel.evidence.filter(ok);
  const result = {
    businessModel: modelEvidence.length ? { ...output.businessModel, evidence: modelEvidence } : { label: 'unknown', evidence: [], confidence: 'low' },
    facts,
    observations,
    rejected,
    unknown,
    at: new Date().toISOString(),
  };
  save(join(p.researchDir, 'business-ops.json'), result);
  return result;
}

export const loadBusinessOps = (p) => load(join(p.researchDir, 'business-ops.json'), null);
