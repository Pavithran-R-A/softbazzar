import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { products } from '../src/data.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const overrides = readFileSync(new URL('../src/storefront-overrides.js', import.meta.url), 'utf8');

const byId = (id) => products.find((product) => product.id === id);
const offersFor = (product) => (
  Array.isArray(product?.variants) && product.variants.length ? product.variants : [product]
);
const offerCount = products.reduce((sum, product) => sum + offersFor(product).length, 0);

test('September 2026 catalogue matches the supplied storefront set', () => {
  assert.equal(products.length, 50);
  assert.equal(offerCount, 62);
  assert.equal(new Set(products.map((product) => product.id)).size, products.length);

  assert.equal(byId('gemini-pro')?.name, 'Gemini Pro (18 Months)');
  assert.equal(byId('gemini-pro')?.priceNum, 649);
  assert.equal(byId('gemini-pro')?.mrp, '₹17,550');
  assert.equal(byId('canva-pro')?.priceNum, 229);
  assert.equal(byId('chatgpt-plus')?.priceNum, 699);
  assert.equal(byId('microsoft-365-lifetime')?.mrp, '₹6,899/Year');
  assert.equal(byId('autodesk-all-apps-1y')?.mrp, '₹2.2 Lakhs');
  assert.equal(byId('posthog-scale-1y')?.mrp, 'US$24,000');
});

test('multi-plan products keep every supplied price and MRP as variants', () => {
  const grok = byId('super-grok');
  assert.deepEqual(
    grok.variants.map(({ name, priceNum, mrp }) => [name, priceNum, mrp]),
    [['1 Year', 1749, '₹34,423'], ['7–10 Days', 199, '₹956']],
  );

  const capcut = byId('capcut-pro');
  assert.deepEqual(
    capcut.variants.map(({ name, priceNum, mrp }) => [name, priceNum, mrp]),
    [
      ['1 Month • Ready Account • 25 Days Warranty', 449, '₹999'],
      ['1 Week', 99, '₹249'],
      ['1 Month • Ready Account • 7 Days Warranty', 229, '₹999'],
    ],
  );

  const freepik = byId('freepik-magnific');
  assert.deepEqual(freepik.variants.map((v) => v.priceNum), [749, 1999, 3999, 7999]);
  assert.deepEqual(freepik.variants.map((v) => v.mrp), ['₹1,740', '₹5,220', '₹10,440', '₹15,140']);

  const envato = byId('envato-elements');
  assert.deepEqual(envato.variants.map((v) => v.priceNum), [799, 2299, 4499, 8999]);
  assert.deepEqual(envato.variants.map((v) => v.mrp), ['₹3,390', '₹10,170', '₹20,340', '₹40,680']);

  const lovable = byId('lovable-unlimited');
  assert.deepEqual(lovable.variants.map((v) => v.priceNum), [799, 1999, 149]);
  assert.equal(lovable.variants[1].mrp, undefined);
  assert.equal(lovable.variants[2].mrp, undefined);
});

test('all selling prices are positive and numeric MRPs exceed their selling price', () => {
  for (const product of products) {
    for (const offer of offersFor(product)) {
      assert.ok(Number.isFinite(offer.priceNum) && offer.priceNum > 0, `${product.id} has invalid selling price`);
      if (Number.isFinite(offer.mrpNum)) {
        assert.ok(offer.mrpNum > offer.priceNum, `${product.id}/${offer.name || 'default'} MRP must exceed selling price`);
        assert.ok(offer.mrp, `${product.id} numeric MRP must have display text`);
      }
    }
  }
});

test('items supplied without MRP keep sale price only', () => {
  assert.equal(byId('dreamina-seedance-basic')?.mrp, undefined);
  const lovable = byId('lovable-unlimited');
  assert.equal(lovable.variants.find((v) => v.name.includes('Admin Panel'))?.mrp, undefined);
  assert.equal(lovable.variants.find((v) => v.name.includes('1 Day'))?.mrp, undefined);
});

test('checkout uses Telegram screenshot flow without clearing the cart', () => {
  assert.match(overrides, /send my payment screenshot in this Telegram chat/);
  assert.match(overrides, /10 mins - 16 hours/);
  assert.match(overrides, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(overrides, /localStorage\.removeItem|writeStoredCart\(\[\]\)/);
});

test('variant detail pricing updates MRP and discount alongside selling price', () => {
  assert.match(overrides, /function applyVariantPricing\(\)/);
  assert.match(overrides, /\.detail-original/);
  assert.match(overrides, /\.detail-save/);
  assert.match(overrides, /requestAnimationFrame\(applyVariantPricing\)/);
});

test('activity ticker remains dynamic but is rewritten as a non-transactional highlight', () => {
  assert.match(overrides, /\/just purchased\/i/);
  assert.match(overrides, /Featured now/);
  assert.match(overrides, /Catalogue highlight/);
  assert.match(overrides, /Deal spotlight/);
  assert.match(overrides, /Popular pick/);
  assert.match(overrides, /current offer/);
  assert.doesNotMatch(overrides, /just purchased <span>/);
});

test('original hero video implementation is preserved and override changes copy only', () => {
  assert.match(mainJs, /hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08\.mp4/);
  assert.match(mainJs, /<video class="bg-video" id="bgVideo"/);
  assert.doesNotMatch(overrides, /bgVideo|\.bg-video|VIDEO_URL|hero-wrapper|blur-overlay/);
  assert.match(overrides, /\.hero-subtitle/);
});

test('override loads after the original application module', () => {
  const mainIndex = indexHtml.indexOf('/src/main.js');
  const overrideIndex = indexHtml.indexOf('/src/storefront-overrides.js');
  assert.ok(mainIndex >= 0 && overrideIndex > mainIndex);
});
