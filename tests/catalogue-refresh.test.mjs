import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { products } from '../src/data.js';

const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('active storefront has no manually maintained products', () => {
  assert.deepEqual(products, []);
  assert.match(source, /fetch\('\/api\/catalogue'\)/);
  assert.match(worker, /supplierRequest\('\/products'/);
});

test('catalogue sync uses two minute schedule and preserves last known good data', () => {
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /\*\/2 \* \* \* \*/);
  assert.match(worker, /empty_supplier_catalogue/);
  assert.match(worker, /ON CONFLICT\(supplier_id\) DO UPDATE/);
});

test('unsafe fake social proof and manual checkout are absent', () => {
  assert.doesNotMatch(source, /just purchased/);
  assert.match(source, /Create order quote/);
  assert.match(source, /No payment is collected/);
});
