import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { products } from '../src/data.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const overrides = readFileSync(new URL('../src/storefront-overrides.js', import.meta.url), 'utf8');

const byId = (id) => products.find((product) => product.id === id);

test('September 2026 catalogue contains the supplied storefront offers with unique IDs', () => {
  assert.ok(products.length >= 60, `expected at least 60 offers, got ${products.length}`);
  assert.equal(new Set(products.map((product) => product.id)).size, products.length);

  assert.equal(byId('gemini-pro')?.priceNum, 649);
  assert.equal(byId('gemini-pro')?.mrp, '₹17,550');
  assert.equal(byId('canva-pro')?.priceNum, 229);
  assert.equal(byId('chatgpt-plus')?.priceNum, 699);
  assert.equal(byId('super-grok-1y')?.priceNum, 1749);
  assert.equal(byId('microsoft-365-lifetime')?.mrp, '₹6,899/Year');
  assert.equal(byId('autodesk-all-apps-1y')?.mrp, '₹2.2 Lakhs');
  assert.equal(byId('posthog-scale-1y')?.mrp, 'US$24,000');
  assert.equal(byId('envato-elements-12m')?.priceNum, 8999);
  assert.equal(byId('freepik-magnific-12m')?.priceNum, 7999);
});

test('all sellable prices are positive and INR MRPs exceed selling prices where numeric MRP is supplied', () => {
  for (const product of products) {
    assert.ok(Number.isFinite(product.priceNum) && product.priceNum > 0, `${product.id} has invalid selling price`);
    if (Number.isFinite(product.mrpNum)) {
      assert.ok(product.mrpNum > product.priceNum, `${product.id} MRP must exceed selling price`);
      assert.ok(product.mrp, `${product.id} numeric MRP must have display text`);
    }
  }
});

test('items supplied without an MRP show only selling price', () => {
  for (const id of ['lovable-unlimited-admin', 'lovable-unlimited-1d', 'dreamina-seedance-basic']) {
    const product = byId(id);
    assert.ok(product, `${id} missing`);
    assert.equal(product.mrp, undefined);
  }
});

test('checkout copy uses Telegram screenshot flow and keeps the requested delivery window', () => {
  assert.match(overrides, /After I pay, I will reply here with my payment screenshot\./);
  assert.match(overrides, /10 mins - 16 hours/);
  assert.match(overrides, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(overrides, /localStorage\.removeItem|writeStoredCart\(\[\]\)/);
});

test('activity ticker is retained but rewritten as a non-transactional catalogue highlight', () => {
  assert.match(overrides, /Featured now/);
  assert.match(overrides, /Catalogue highlight/);
  assert.match(overrides, /current offer/);
});

test('hero video implementation and visual CSS are not modified by the refresh layer', () => {
  assert.match(mainJs, /hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08\.mp4/);
  assert.match(mainJs, /id="bgVideo"/);
  assert.doesNotMatch(overrides, /bgVideo|\.bg-video|VIDEO_URL|hero-wrapper|blur-overlay/);
  assert.match(overrides, /\.hero-subtitle/);
});

test('storefront override loads after the original application module', () => {
  const mainIndex = indexHtml.indexOf('/src/main.js');
  const overrideIndex = indexHtml.indexOf('/src/storefront-overrides.js');
  assert.ok(mainIndex >= 0 && overrideIndex > mainIndex);
});
