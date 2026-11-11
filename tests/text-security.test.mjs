import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHTML } from '../src/text-security.js';
import { sanitizeSupplierDescription, SUPPLIER_NOTES_WITHHELD } from '../src/supplier-content.js';

test('supplier markup and link schemes stay inert plain text', () => {
  const description = '<a href="javascript:alert(1)" onclick="alert(2)">claim</a>';
  const safe = sanitizeHTML(description);
  assert.equal(safe, '&lt;a href=&quot;javascript:alert(1)&quot; onclick=&quot;alert(2)&quot;&gt;claim&lt;/a&gt;');
  assert.doesNotMatch(safe, /<\s*(?:a|script|img)\b/i);
  assert.equal(sanitizeHTML(null), null);
});

test('unsafe supplier payment and contact claims are withheld', () => {
  const description = 'Pay in the bot. Send screenshots to @unknownSeller https://bad.example';
  assert.equal(sanitizeSupplierDescription(description), SUPPLIER_NOTES_WITHHELD);
  assert.equal(sanitizeSupplierDescription('javascript:alert(1)'), SUPPLIER_NOTES_WITHHELD);
  assert.equal(sanitizeSupplierDescription('Your cost is 10 USDT'), SUPPLIER_NOTES_WITHHELD);
});

test('safe supplier descriptions stay bounded plain text', () => {
  assert.equal(sanitizeSupplierDescription('Lifetime digital access'), 'Lifetime digital access');
  assert.equal(
    sanitizeSupplierDescription('Monthly plan includes a 25 day warranty and delivery by email.'),
    'Monthly plan includes a 25 day warranty and delivery by email.',
  );
  assert.equal(sanitizeSupplierDescription('  Safe\nlisting\u0000text  '), 'Safe listing text');
  assert.equal(sanitizeSupplierDescription('x'.repeat(1500)).length, 1200);
});
