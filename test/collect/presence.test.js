import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresence } from '../../collect/presence.js';

const page = {
  url: 'https://www.brand.com.sa/ar',
  title: 'براند | متجر',
  lang: 'ar',
  siteName: 'Brand',
  ogImage: 'https://www.brand.com.sa/og-banner.jpg',
  icons: [{ href: 'https://www.brand.com.sa/favicon-32.png', sizes: '32x32', rel: 'icon' }, { href: 'https://www.brand.com.sa/apple-touch-icon.png', sizes: '180x180', rel: 'apple-touch-icon' }],
  links: [
    { href: 'https://www.instagram.com/brand.sa/', text: 'Instagram' },
    { href: 'https://instagram.com/brand.sa?igsh=1', text: '' },
    { href: 'https://www.instagram.com/p/Cxyz/', text: 'a post' },
    { href: 'https://www.tiktok.com/@brandsa', text: '' },
    { href: 'https://twitter.com/intent/tweet?text=hi', text: 'share' },
    { href: 'https://wa.me/966500000000', text: 'WhatsApp' },
    { href: 'tel:+966 50 000 0000', text: 'call' },
    { href: 'mailto:hello@brand.com.sa', text: 'mail' },
  ],
  ldJson: [JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Brand Company', logo: { '@type': 'ImageObject', url: 'https://www.brand.com.sa/logo-schema.png' }, sameAs: ['https://www.linkedin.com/company/brand-sa', 'https://x.com/brandsa'] }), '{broken'],
  images: [
    { src: 'https://www.brand.com.sa/assets/logo.svg', hints: 'logo.svg شعار site-logo', top: 20, width: 140, height: 40, inHeader: true, linksHome: true },
    { src: 'https://www.brand.com.sa/hero.jpg', hints: 'hero', top: 200, width: 1400, height: 600, inHeader: false, linksHome: false },
    { src: 'https://www.brand.com.sa/pixel.gif', hints: 'tracking', top: 0, width: 1, height: 1, inHeader: false, linksHome: false },
  ],
  svgLogos: [],
  text: 'تواصل معنا على +966 50 000 0000',
};

test('profiles, logo candidates, contacts and the market are found on the website, best first', () => {
  const r = parsePresence(page);
  assert.equal(r.website, 'https://www.brand.com.sa/ar');
  assert.equal(r.name, 'Brand Company');
  assert.equal(r.language, 'Arabic');
  const byPlatform = Object.fromEntries(r.socials.map((s) => [s.platform, s]));
  assert.deepEqual(Object.keys(byPlatform).sort(), ['instagram', 'linkedin', 'tiktok', 'x']);
  assert.equal(r.socials.filter((s) => s.platform === 'instagram').length, 1, 'the same profile linked twice is listed once; posts are not profiles');
  assert.equal(byPlatform.linkedin.source, 'structured data');
  assert.equal(byPlatform.instagram.source, 'website link');
  assert.equal(r.whatsapp, 'https://wa.me/966500000000');
  assert.equal(r.logos[0].url, 'https://www.brand.com.sa/logo-schema.png', 'the logo the site declares comes first');
  assert.equal(r.logos[1].url, 'https://www.brand.com.sa/assets/logo.svg', 'then the header logo linking home');
  assert.ok(r.logos.some((l) => l.source === 'structured data'));
  assert.ok(r.logos.some((l) => l.url.endsWith('apple-touch-icon.png')));
  assert.ok(!r.logos.some((l) => l.url.endsWith('hero.jpg')), 'a big hero image is not a logo');
  assert.deepEqual(r.emails, ['hello@brand.com.sa']);
  assert.ok(r.phones.includes('+966500000000'));
  assert.equal(r.market, 'Saudi Arabia');
  assert.equal(r.marketBasis, '.sa domain');
});

test('an Egyptian phone number sets the market when the domain says nothing', () => {
  const r = parsePresence({ url: 'https://shop.example.com/', links: [{ href: 'tel:+201001234567' }], text: '', images: [], icons: [], ldJson: [] });
  assert.equal(r.market, 'Egypt');
  assert.equal(r.marketBasis, 'phone number on the website');
  assert.deepEqual(r.logos, []);
});
