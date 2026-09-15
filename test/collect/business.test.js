// Business signals read by code: how customers buy, payments, lead handling, tools, trust. False positives are tested too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBusinessSignals, pickBusinessPages } from '../../collect/business.js';

const byKey = (checks) => Object.fromEntries(checks.map((c) => [c.key, c]));

test('a Saudi store: checkout, prices, payment methods, BNPL, cash on delivery, returns and the e-store badge', () => {
  const home = {
    url: 'https://shop.example.sa/',
    html: '<script src="https://cdn.salla.network/x.js"></script><img src="/payments/mada.svg"><img src="/icons/tabby.png"><button class="salla-add-product-button">أضف للسلة</button><a href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/123">موثق</a><script type="application/ld+json">{"@type":"Product","offers":{"price":"149"}}</script>',
    text: 'عطر العود 149 ر.س أضف للسلة الدفع عند الاستلام متاح. الرقم الضريبي: 310123456700003',
    links: [{ href: 'https://shop.example.sa/p/return-policy', text: 'سياسة الاسترجاع' }, { href: 'https://wa.me/966500000000' }],
  };
  const c = byKey(detectBusinessSignals({ pages: [home], dns: { mx: ['aspmx.l.google.com'], txt: ['v=spf1 include:servers.mcsv.net ~all'] }, market: 'Saudi Arabia' }));
  assert.equal(c.biz_online_checkout.result, 'present');
  assert.equal(c.biz_prices_visible.result, 'present');
  assert.match(c.biz_payment_methods.value, /mada/);
  assert.match(c.biz_payment_methods.value, /Tabby/);
  assert.match(c.biz_payment_methods.value, /Cash on delivery/);
  assert.equal(c.biz_bnpl.value, 'Tabby');
  assert.equal(c.biz_cod.result, 'present');
  assert.equal(c.biz_returns_policy.result, 'present');
  assert.equal(c.biz_sbc_badge.result, 'present');
  assert.match(c.biz_vat_cr_shown.value, /VAT 310123456700003/);
  assert.match(c.biz_business_email.value, /Google Workspace/);
  assert.equal(c.biz_email_tools.value, 'Mailchimp');
  assert.match(c.biz_whatsapp_path.value, /WhatsApp link/);
});

test('a B2B manufacturer: quote path, catalogue PDF and project signs; a search form is not an enquiry form; "value" is not valU', () => {
  const home = {
    url: 'https://factory.example.com/',
    html: '<form role="search"><input type="search" name="q"></form><form><input type="email" name="email"><textarea name="message"></textarea></form><p>Great value for contractors</p>',
    text: 'Our projects. Our clients. Request a quote today. Great value.',
    links: [{ href: 'https://factory.example.com/files/company-profile.pdf', text: 'Download profile' }],
  };
  const c = byKey(detectBusinessSignals({ pages: [home], dns: null, market: 'Egypt' }));
  assert.equal(c.biz_quote_request.result, 'present');
  assert.equal(c.biz_catalogue_pdf.result, 'present');
  assert.match(c.biz_b2b_indicators.value, /our projects/);
  assert.equal(c.biz_lead_form.result, 'present', 'the contact form counts');
  assert.equal(c.biz_payment_methods.result, 'unknown', 'not a store: payment methods are unknown, not absent');
  assert.ok(!c.biz_bnpl, 'no BNPL check without payments or a store');
  assert.equal(c.biz_crm_tools.result, 'unknown', 'without DNS records the CRM check is unknown');
  assert.ok(!c.biz_sbc_badge, 'Saudi-only checks do not run for an Egyptian client');

  const searchOnly = byKey(detectBusinessSignals({ pages: [{ url: 'https://x.com/', html: '<form role="search"><input type="email" name="email"><input name="q"></form>', text: '', links: [] }], dns: { mx: [], txt: [] } }));
  assert.equal(searchOnly.biz_lead_form.result, 'absent');
  assert.equal(searchOnly.biz_business_email.result, 'absent');
});

test('business pages to read are picked from the site\'s own contact, shipping and returns links', () => {
  const pages = pickBusinessPages('https://shop.example.sa/', [{ href: 'https://shop.example.sa/contact-us', text: 'Contact' }, { href: 'https://other.com/returns', text: 'Returns' }, { href: 'https://shop.example.sa/p/سياسة-الاسترجاع', text: '' }, { href: 'https://shop.example.sa/products/1', text: 'Oud' }, { href: 'https://shop.example.sa/shipping', text: 'الشحن' }, { href: 'https://shop.example.sa/faq', text: 'FAQ' }]);
  assert.equal(pages.length, 3);
  assert.ok(pages.every((u) => u.startsWith('https://shop.example.sa/')));
  assert.ok(!pages.some((u) => /products/.test(u)));
});
