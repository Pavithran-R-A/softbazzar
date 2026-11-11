import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, setCatalogue } from '../src/data.js';

test('catalogue categories merge case-only duplicates', () => {
  setCatalogue([
    { cat: 'Digital' },
    { cat: 'digital' },
    { cat: 'Account' },
    { cat: ' account ' },
    { cat: '' },
  ]);
  assert.deepEqual(categories, ['All', 'Digital', 'Account']);
});
