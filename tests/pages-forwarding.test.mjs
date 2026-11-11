import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as forwardApi } from '../pages/functions/api/[[path]].js';
import { onRequest as forwardProduct } from '../pages/functions/product/[[path]].js';

for (const [name, forward] of [['API', forwardApi], ['product', forwardProduct]]) {
  test(`${name} forwarding preserves request and response`, async () => {
    const body = JSON.stringify({ items: [{ productId: 'supplier-42', quantity: 2 }] });
    const request = new Request('https://softbazzar.pages.dev/api/orders?quote=1', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-test-token',
        'Content-Type': 'application/json',
        Origin: 'https://softbazzar.pages.dev',
        'Idempotency-Key': 'forwarding-test-key-12345',
      },
      body,
    });
    let forwarded;
    const response = new Response('upstream response', {
      status: 409,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });

    const result = await forward({ request, env: {
      SOFTBAZZAR_API: { fetch: (value) => { forwarded = value; return response; } },
    } });

    assert.equal(forwarded, request);
    assert.equal(forwarded.url, request.url);
    assert.equal(forwarded.method, 'POST');
    assert.equal(forwarded.headers.get('Authorization'), 'Bearer admin-test-token');
    assert.equal(forwarded.headers.get('Origin'), 'https://softbazzar.pages.dev');
    assert.equal(forwarded.headers.get('Idempotency-Key'), 'forwarding-test-key-12345');
    assert.equal(await forwarded.text(), body);
    assert.equal(result, response);
    assert.equal(result.status, 409);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(await result.text(), 'upstream response');
  });
}

test('API forwarding fails closed when binding is missing', async () => {
  const response = await forwardApi({
    request: new Request('https://softbazzar.pages.dev/api/catalogue'),
    env: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'api_unavailable' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
