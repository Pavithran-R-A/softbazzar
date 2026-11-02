import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { products } from '../src/data.js';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const overrideSource = readFileSync(new URL('../src/storefront-overrides.js', import.meta.url), 'utf8');
const pagesSource = readFileSync(new URL('../src/pages.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const seoGeneratorSource = readFileSync(new URL('../scripts/generate-seo.mjs', import.meta.url), 'utf8');

test('production source contains no browser-only admin password or admin price overrides', () => {
  assert.doesNotMatch(mainSource, /Enter Admin Password|sb_admin_auth|sb_admin_data|btoa\(/);
});

test('customer navigation uses real paths rather than hash application routes', () => {
  assert.doesNotMatch(mainSource, /location\.hash|window\.location\.hash|href=["'`]#(?:checkout|privacy|terms|product\/)/);
  assert.match(mainSource, /window\.location\.pathname|location\.pathname/);
  assert.match(mainSource, /history\.pushState/);
});

test('cart storage is ID-only and recalculates totals from current catalogue data', async () => {
  const cartModulePath = new URL('../src/cart-model.js', import.meta.url);
  assert.ok(existsSync(cartModulePath), 'src/cart-model.js must exist');
  const { normalizeStoredCart, calculateCartTotal } = await import(cartModulePath.href);
  const product = products.find((entry) => entry.inStock !== false && (!entry.variants || entry.variants.some((variant) => !variant.disabled)));
  assert.ok(product, 'catalogue needs one purchasable product');
  const variant = product.variants?.find((entry) => !entry.disabled) ?? null;
  const expectedUnitPrice = variant?.priceNum ?? product.priceNum;
  const legacyTamperedRow = { id: product.id, vName: variant?.name ?? product.name, vPriceNum: 1, vPrice: '₹1', icon: 'fake', cat: 'fake', color: '#000', qty: 2 };
  const normalized = normalizeStoredCart([legacyTamperedRow]);
  assert.deepEqual(normalized, [{ id: product.id, variantName: variant?.name ?? null, qty: 2 }]);
  assert.equal(calculateCartTotal(normalized), expectedUnitPrice * 2);
  assert.doesNotMatch(JSON.stringify(normalized), /vPrice|priceNum|icon|color|cat/);
});

test('cart storage failure is reported without claiming persistence', async () => {
  const { writeStoredCart } = await import('../src/cart-model.js');
  const unavailableStorage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  assert.equal(writeStoredCart([], unavailableStorage), false);
});

test('storefront avoids unsupported delivery and social-proof promises', () => {
  const overridesSource = readFileSync(new URL('../src/storefront-overrides.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mainSource, /instant delivery|50K\+|200\+|99%|24\/7|securely via UPI/i);
  assert.doesNotMatch(mainSource, /Trusted brands/);
  assert.doesNotMatch(overridesSource, /Popular pick|just purchased/i);
  assert.doesNotMatch(overridesSource, /10m–16h|Delivery Window/);
  const posthog = products.find((product) => product.id === 'posthog-scale-1y');
  assert.ok(posthog);
  assert.equal(posthog.mrpNum, undefined);
  assert.equal(posthog.mrp, undefined);
});

test('cart dialog exposes and manages accessible dialog state', () => {
  assert.match(mainSource, /role="dialog"/);
  assert.match(mainSource, /aria-modal="true"/);
  assert.match(mainSource, /aria-expanded/);
  assert.match(mainSource, /focus\(\)/);
  assert.match(mainSource, /event\.key === 'Escape'/);
  assert.match(overrideSource, /if \(!drawer\.classList\.contains\('open'\)\) drawer\.setAttribute\('inert', ''\)/);
  assert.match(overrideSource, /String\(Boolean\(drawer\?\.classList\.contains\('open'\)\)\)/);
});

test('route-rendered pages use a main landmark and useful product controls', () => {
  assert.match(mainSource, /<main/);
  assert.match(mainSource, /aria-label="Remove/);
  assert.match(mainSource, /aria-pressed/);
  assert.match(mainSource, /aria-hidden="true"/);
});

test('public policy copy describes localStorage accurately rather than claiming cart cookies', () => {
  assert.doesNotMatch(pagesSource, /essential cookies to maintain your cart session/i);
  assert.match(pagesSource, /localStorage|local storage/i);
});

test('Vercel config exposes only explicit app routes and baseline browser security headers', () => {
  const serialized = JSON.stringify(vercel);
  assert.match(serialized, /X-Content-Type-Options/);
  assert.match(serialized, /Content-Security-Policy/);
  assert.match(serialized, /Referrer-Policy/);
  assert.doesNotMatch(serialized, /"source":"\/\(\.\*\)"[^}]*"destination":"\/index\.html"/);
});

test('SEO generator exists and hash fragments are not used as sitemap URLs', () => {
  const generatorPath = new URL('../scripts/generate-seo.mjs', import.meta.url);
  assert.ok(existsSync(generatorPath), 'scripts/generate-seo.mjs must exist');
  assert.doesNotMatch(seoGeneratorSource, /at lower prices|premium tools and digital subscriptions/i);
  assert.match(seoGeneratorSource, /replaceFallback\(html, `<main>\$\{page\.content\}<\/main>`\)/);
  if (existsSync(new URL('../public/sitemap.xml', import.meta.url))) {
    const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
    assert.doesNotMatch(sitemap, /#contact|#product|#privacy|#terms/);
  }
});
