import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHTML } from '../src/text-security.js';

test('supplier markup and link schemes stay inert plain text', () => {
  const description = '<a href="javascript:alert(1)" onclick="alert(2)">claim</a>';
  const safe = sanitizeHTML(description);
  assert.equal(safe, '&lt;a href=&quot;javascript:alert(1)&quot; onclick=&quot;alert(2)&quot;&gt;claim&lt;/a&gt;');
  assert.doesNotMatch(safe, /<\s*(?:a|script|img)\b/i);
  assert.equal(sanitizeHTML(null), null);
});
