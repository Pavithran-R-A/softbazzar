import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProductFamilies, editorialProductOrder, featuredProductFamilies, findProductFamily } from '../src/product-families.js';

const item = (id, name, priceInrPaise, inStock = true) => ({ id, name, priceInrPaise, inStock });

test('groups supplier offers by unambiguous product names', () => {
  const families = deriveProductFamilies([
    item('a', 'ChatGPT Business 1 Month', 10000),
    item('b', 'Chat GPT Plus 1 Month', 9000),
    item('c', 'Grok + Cursor Premium', 8000),
  ]);
  const chatgpt = findProductFamily(families, 'chatgpt');
  assert.deepEqual(chatgpt.products.map(({ id }) => id), ['b', 'a']);
  assert.equal(chatgpt.startingPricePaise, 9000);
  assert.equal(families.find(({ products }) => products[0].id === 'c').standalone, true);
});

test('featured families use editorial rank, not popularity', () => {
  const families = deriveProductFamilies([
    item('a', 'Claude Pro', 11000), item('b', 'Canva Pro', 12000),
    item('c', 'Gemini Pro', 13000), item('d', 'Spotify Premium', 14000),
  ]);
  const featured = featuredProductFamilies(families);
  assert.deepEqual(featured.map(({ slug }) => slug), ['gemini', 'claude', 'canva', 'spotify']);
  assert.ok(featured.every(({ popular }) => popular === undefined));
});

test('full catalogue follows editorial rank then stable fallback', () => {
  const offers = [
    item('z-unmatched', 'Zulu Utility', 9000),
    item('claude-high', 'Claude Pro', 8000),
    item('a-unmatched', 'Alpha Utility', 3000),
    item('chatgpt', 'Chat GPT Plus', 6000),
    item('claude-low', 'Claude Starter', 2000),
    item('z-same-title', 'Same Utility', 7000),
    item('a-same-title', 'Same Utility', 7000),
  ];
  assert.deepEqual(
    editorialProductOrder(offers).map(({ id }) => id),
    ['chatgpt', 'claude-high', 'claude-low', 'a-unmatched', 'a-same-title', 'z-same-title', 'z-unmatched'],
  );
});

test('out of stock offers do not define starting price', () => {
  const [family] = deriveProductFamilies([
    item('a', 'Netflix Premium 1 Month', 1000, false),
    item('b', 'Netflix Profile 1 Month', 3000, true),
  ]);
  assert.equal(family.availableOffers, 1);
  assert.equal(family.startingPricePaise, 3000);
});

test('variant offers determine family starting price', () => {
  const [family] = deriveProductFamilies([{
    ...item('variant-price', 'ChatGPT Business', 9000),
    variants: [
      { id: 'available', inStock: true, priceInrPaise: 7000 },
      { id: 'cheaper-but-sold', inStock: false, disabled: true, priceInrPaise: 1000 },
    ],
  }]);
  assert.equal(family.startingPricePaise, 7000);
});

test('standalone offer slugs preserve unique supplier IDs', () => {
  const ids = ['SKU:A', 'SKU/A', `${'x'.repeat(80)}1`, `${'x'.repeat(80)}2`];
  const families = deriveProductFamilies(ids.map((id) => item(id, 'Unmatched supplier listing', 1000)));
  assert.equal(new Set(families.map(({ slug }) => slug)).size, ids.length);
  assert.deepEqual(families.flatMap(({ products: offers }) => offers.map(({ id }) => id)).sort(), [...ids].sort());
});
