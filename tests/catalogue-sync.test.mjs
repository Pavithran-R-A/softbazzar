import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCatalogue } from '../src/catalogue-sync.js';
import { parseProducts, supplierRequest } from '../src/supplier.js';
import { priceProduct } from '../src/pricing.js';
import { MockInventoryAdapter } from './helpers/mock-inventory.mjs';

const product = (overrides = {}) => ({
  id: 'sku-1', name: 'Product', description: 'Description', costUsdt: '10',
  stock: 4, unlimited: false, duration: 'Monthly', requiresEmail: true,
  type: 'AI', ...overrides,
});

test('mock inventory returns isolated, count-checked catalogue data', async () => {
  const source = new MockInventoryAdapter([{ id: 'a', name: 'A' }]);
  const first = await source.listProducts();
  first.products[0].name = 'mutated';
  assert.equal((await source.listProducts()).products[0].name, 'A');
  assert.equal(source.calls, 2);
  source.failWith();
  await assert.rejects(source.listProducts(), /outage/);
});

test('supplier envelope rejects failed and partial catalogues', () => {
  assert.throws(() => parseProducts({ success: false, products: [] }), /rejected/);
  assert.throws(() => parseProducts({ success: true, count: 2, products: [{ id: 1, name: 'A', cost: 1, stock: 1 }] }), /count/);
  assert.equal(parseProducts({ success: true, count: 1, products: [{ id: 1, name: 'A', your_cost: 1, stock: 1 }] }).length, 1);
});

test('catalogue replacement retires old supplier products', () => {
  const plan = reconcileCatalogue([
    { supplier_id: 'old', active: 1 },
    { supplier_id: 'same', name: 'Product', description: 'Description', cost_usdt: '10', stock: 4, is_unlimited: 0, duration: 'Monthly', requires_email: 1, type: 'AI', active: 1 },
  ], [product({ id: 'same' }), product({ id: 'new' })]);
  assert.equal(plan.imported, 1);
  assert.equal(plan.updated, 0);
  assert.deepEqual(plan.removed, ['old']);
  assert.deepEqual(plan.changed.map(({ id }) => id), ['new']);
});

test('price and stock changes trigger updated sync snapshots', () => {
  const plan = reconcileCatalogue([
    { supplier_id: 'sku-1', name: 'Product', description: 'Description', cost_usdt: '10', stock: 4, is_unlimited: 0, duration: 'Monthly', requires_email: 1, type: 'AI', active: 1 },
  ], [product({ costUsdt: '12', stock: 2 })]);
  assert.equal(plan.imported, 0);
  assert.equal(plan.updated, 1);
  assert.deepEqual(plan.changed.map(({ id }) => id), ['sku-1']);
  const price = priceProduct('12','105');
  assert.equal(price.sellUsdt, 15);
  assert.equal(price.priceInrPaise, 157500);
  assert.equal(price.priceUsd, 15);
});

test('supplier credentials stay server-side and requests remain read-only', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ success: true, count: 0, products: [] }));
  };
  await supplierRequest('/products', { env: { AITOOLSHOP_API_KEY: 'secret-test-value' }, fetchImpl });
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.headers.Authorization, 'Bearer secret-test-value');
  assert.match(captured.url, /^https:\/\/aitoolshop\.aitoolifystudio\.io\//);
  assert.equal(captured.options.body, undefined);
  await assert.rejects(supplierRequest('/products', { env: {}, fetchImpl }), /credentials/);
});
