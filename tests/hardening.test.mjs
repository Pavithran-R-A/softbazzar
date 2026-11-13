import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { priceProduct } from '../src/pricing.js';
import { parseProducts } from '../src/supplier.js';
import { setCatalogue } from '../src/data.js';
import { calculateCartTotalPaise, normalizeStoredCart, resolveSelection, writeStoredCart } from '../src/cart-model.js';

test('fixed 105 conversion applies exact 25 percent markup', () => {
  const value = priceProduct('10');
  assert.equal(value.sellUsdt, 12.5);
  assert.equal(value.priceInrPaise, 131250);
  assert.equal(value.priceUsd, 12.5);
  assert.equal(value.usdInr, '105');
  assert.equal(priceProduct('0.01').priceInrPaise,131);
  assert.throws(() => priceProduct('1.1234567'));
});

test('supplier parser prefers reseller cost and rejects duplicate IDs', () => {
  const rows = parseProducts([{ id: 7, name: 'Example', your_cost: '10.25', price_usdt: 40, stock_quantity: 3, type: 'AI' }]);
  assert.equal(rows[0].costUsdt, '10.25');
  assert.equal(rows[0].stock, 3);
  assert.throws(() => parseProducts([{ id: 1, name: 'A', your_cost: 1, stock: 1 }, { id: 1, name: 'B', your_cost: 2, stock: 2 }]), /duplicate/);
  assert.throws(() => parseProducts([{ id: 1, name: 'A', your_cost: -3, stock: 1 }]), /invalid/);
  assert.throws(() => parseProducts([{id:4,name:'Missing reseller cost',cost:'10',stock:1}]),/invalid/);
  assert.throws(() => parseProducts([{id:2,name:'Unsafe image',your_cost:'1',stock:1,image_url:'http://example.test/item.jpg'}]),/unsafe image/);
  assert.throws(() => parseProducts([{id:3,name:'Bad variant',your_cost:'1',stock:1,variants:[{id:'v',name:'V',your_cost:'-1',stock:2}]}]),/variant/);
});

test('cart stores supplier IDs and respects current stock', () => {
  setCatalogue([{ id: 'fixture-1', name: 'Fixture', cat: 'Test', price: '₹10.00', priceNum: 10, priceInrPaise:1000, inStock: true, stock: 2, unlimited: false }]);
  const normalized = normalizeStoredCart([{ id: 'fixture-1', qty: 8, priceNum: 0.01 }, { id: 'removed', qty: 1 }]);
  assert.deepEqual(normalized, [{ id: 'fixture-1', variantName: null, qty: 2 }]);
  assert.equal(calculateCartTotalPaise(normalized), 2000);
  const values = new Map(); const storage = { setItem(key, value) { values.set(key, value); } };
  assert.equal(writeStoredCart(normalized, storage), true);
  assert.equal(values.get('sb_cart_v2'), '[{"id":"fixture-1","variantName":null,"qty":2}]');
});

test('variant products require an explicit available selection', () => {
  setCatalogue([{ id: 'variant-product', name: 'Variant product', cat: 'Test', inStock: true, stock: 4, priceInrPaise: 5000, priceNum: 50, variants: [
    { id: 'small', name: 'Small', inStock: true, stock: 2, priceInrPaise: 1000, priceNum: 10 },
    { id: 'sold', name: 'Sold out', inStock: false, stock: 0, priceInrPaise: 500, priceNum: 5, disabled: true },
  ] }]);
  assert.equal(resolveSelection('variant-product'), null);
  assert.equal(resolveSelection('variant-product', 'Sold out'), null);
  assert.equal(resolveSelection('variant-product', 'Small').variantId, 'small');
});

test('sensitive credentials stay worker side and features default disabled', () => {
  const supplier = readFileSync(new URL('../src/supplier.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(supplier, /Authorization: `Bearer \$\{env\.AITOOLSHOP_API_KEY\}`/);
  assert.match(config, /SUPPLIER_PURCHASES_ENABLED = "false"/);
  assert.match(config, /YOUPI_LIVE_ENABLED = "false"/);
  assert.match(worker, /safeEqual\(auth,env\.ADMIN_TOKEN\)/);
  assert.doesNotMatch(ui, /supplierCostUsdt|Supplier cost:/);
});
