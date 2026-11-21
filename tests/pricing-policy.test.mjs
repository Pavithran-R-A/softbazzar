import assert from 'node:assert/strict';
import test from 'node:test';
import { priceProduct } from '../src/pricing.js';

test('applies exactly 25 percent across INR supplier-cost boundaries', () => {
  const examples = [
    ['9.99', 12500, 1249],
    ['10.00', 12500, 1250],
    ['10.01', 12500, 1251],
    ['50.00', 12500, 6250],
    ['99.99', 12500, 12499],
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

test('keeps 25 percent markup across fixed-rate boundaries', () => {
  const examples = [
    ['0.095238', 12500], // ₹9.999990
    ['0.095239', 12500], // ₹10.000095
    ['0.952380', 12500], // ₹99.999900
    ['0.952381', 12500], // ₹100.000005
  ];

  for (const [cost, markupBps] of examples) {
    assert.equal(priceProduct(cost, '105').markupBps, markupBps, `USDT cost ${cost}`);
  }
});

test('uses exact paise rounding and consistent approximate USD', () => {
  const markedUpCost = priceProduct('0.1', '105');
  assert.equal(markedUpCost.markupBps, 12500);
  assert.equal(markedUpCost.priceInrPaise, 1313);
  assert.equal(markedUpCost.priceUsd, 0.13);
  assert.equal(markedUpCost.priceUsd, Math.round(markedUpCost.priceInrPaise / 105) / 100);

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
