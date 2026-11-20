import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProductFamilies, featuredProductFamilies, roundedCatalogueRupees, inferFamilyIdentity } from '../src/product-families.js';
import { iconForProductName } from '../src/data.js';

const product = (id, name, paise = 39375, inStock = true) => ({ id, name, priceInrPaise: paise, inStock, variants: [] });

test('collects all supplier offers of the same brand into one family', () => {
  const families = deriveProductFamilies([
    product('1', 'ElevenLabs Creator Plan 3M'),
    product('2', 'Elevenlab Creator 1M (W5D)'),
    product('3', 'Eleven Reader Ultra 12 Months'),
    product('4', 'Canva Business Panel 1 Month'),
    product('5', 'Slot - Canva Pro Team Edu Invite'),
    product('6', 'API CODEX-10M Token'),
    product('7', 'API CODEX - 100M Token'),
  ]);
  const eleven = families.find((family) => family.slug === 'elevenlabs');
  assert.equal(eleven?.products.length, 3);
  assert.deepEqual(families.find((family) => family.slug === 'canva')?.products.map(({ id }) => id).sort(), ['4', '5']);
  assert.equal(families.find((family) => family.slug === 'codex')?.products.length, 2);
});

test('recognizes popular suppliers even when titles start with account or slot', () => {
  assert.equal(inferFamilyIdentity('Account NordVPN 3M')?.slug, 'nordvpn');
  assert.equal(inferFamilyIdentity('Slot-Microsoft 365 - 1 Year')?.slug, 'microsoft');
  assert.equal(inferFamilyIdentity('Google AI Plus 3m FW')?.slug, 'gemini');
  assert.equal(inferFamilyIdentity('Grok + Cursor Premium 1M')?.slug, 'grok-cursor');
  assert.equal(inferFamilyIdentity('Gemini AI Pro + YouTube Premium')?.slug, 'gemini');
});

test('catalogue amounts round upward to whole rupees only for browsing', () => {
  assert.equal(roundedCatalogueRupees(39375), 394);
  assert.equal(roundedCatalogueRupees(12469), 125);
  assert.equal(roundedCatalogueRupees(12600), 126);
  assert.equal(roundedCatalogueRupees(17), 1);
});

test('every family and supplier offer has relevant visual identity, not generic SB', () => {
  for (const name of ['ChatGPT Plus', 'Canva Pro', 'Eleven Reader Ultra', 'API CODEX 10M']) {
    const mark = iconForProductName(name);
    assert.match(mark, /brand-mark|brand-monogram/);
    assert.doesNotMatch(mark, />SB<\/span>/);
  }
  assert.match(iconForProductName('New Independent Product'), /brand-monogram/);
  assert.doesNotMatch(iconForProductName('New Independent Product'), />SB<\/span>/);
});

test('featured families with stock retain editorial ranking rather than supplier alphabetization', () => {
  const families = deriveProductFamilies([
    product('1', 'Canva Pro'),
    product('2', 'ChatGPT Plus'),
    product('3', 'ElevenLabs Creator'),
    product('4', 'Gemini Pro'),
  ]);
  assert.deepEqual(featuredProductFamilies(families, 18).map((family) => family.slug), ['chatgpt', 'gemini', 'elevenlabs', 'canva']);
});
