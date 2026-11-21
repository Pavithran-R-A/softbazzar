import assert from 'node:assert/strict';
import test from 'node:test';
import { priceProduct } from '../src/pricing.js';

test('applies the selected tier to exact INR supplier-cost boundaries', () => {
  const examples = [
    ['9.99', 12500, 1249],
    ['10.00', 20000, 2000],
    ['10.01', 20000, 2002],
    ['50.00', 20000, 10000],
    ['99.99', 20000, 19998],
    ['100.00', 12500, 12500],
    ['100.01', 12500, 12501],
    ['500.00', 12500, 62500],
    ['1000.00', 12500, 125000],
  ];

  for (const [cost, markupBps, priceInrPaise] of examples) {
    const result = priceProduct(cost, '1');
    assert.equal(result.markupBps, markupBps, `supplier cost ₹${cost}`);
    assert.equal(result.priceInrPaise, priceInrPaise, `supplier cost ₹${cost}`);
  }
});

test('classifies fixed-rate boundaries before paise rounding', () => {
  const examples = [
    ['0.095238', 12500], // ₹9.999990
    ['0.095239', 20000], // ₹10.000095
    ['0.952380', 20000], // ₹99.999900
    ['0.952381', 12500], // ₹100.000005
  ];

  for (const [cost, markupBps] of examples) {
    assert.equal(priceProduct(cost, '105').markupBps, markupBps, `USDT cost ${cost}`);
  }
});

test('uses exact paise rounding and consistent approximate USD', () => {
  const twoDigitCost = priceProduct('0.1', '105');
  assert.equal(twoDigitCost.markupBps, 20000);
  assert.equal(twoDigitCost.priceInrPaise, 2100);
  assert.equal(twoDigitCost.priceUsd, 0.2);
  assert.equal(twoDigitCost.priceUsd, Math.round(twoDigitCost.priceInrPaise / 105) / 100);

  const standardCost = priceProduct('0.01', '105');
  assert.equal(standardCost.markupBps, 12500);
  assert.equal(standardCost.priceInrPaise, 131);
  assert.equal(standardCost.priceUsd, 0.01);
  assert.equal(standardCost.priceUsd, Math.round(standardCost.priceInrPaise / 105) / 100);
});

test('rejects malformed, nonpositive, and unsafe prices', () => {
  for (const cost of ['', '0', '-1', '1.1234567', 'NaN', '10000000000']) {
    assert.throws(() => priceProduct(cost), undefined, `cost ${cost}`);
  }
  assert.throws(() => priceProduct('1', '0'));
  assert.throws(() => priceProduct('9999999999.999999', '10000'), RangeError);
});

test('real-world two-digit wholesale ₹94.50 doubles to ₹189.00, not the old 25% amount', () => {
  const result = priceProduct('0.9','105');
  assert.equal(result.markupBps, 20000);
  assert.equal(result.priceInrPaise, 18900);
});
