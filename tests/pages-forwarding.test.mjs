import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as forwardApi } from '../pages/functions/api/[[path]].js';
import { onRequest as renderProduct } from '../pages/functions/product/[[path]].js';

test('non-catalogue API requests preserve backend security boundaries', async () => {
  const body = JSON.stringify({ items: [{ productId: 'supplier-42', quantity: 2 }] });
  const request = new Request('https://preview.pages.dev/api/orders?quote=1', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-test-token',
      'Content-Type': 'application/json',
      Origin: 'https://preview.pages.dev',
      'Idempotency-Key': 'forwarding-test-key-12345',
    },
    body,
  });
  let forwarded;
  const upstream = new Response('upstream response', {
    status: 409,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

  const result = await forwardApi({
    request,
    env: { SOFTBAZZAR_API: { fetch: (value) => { forwarded = value; return upstream; } } },
  });

  assert.equal(forwarded, request);
  assert.equal(forwarded.url, request.url);
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.headers.get('Authorization'), 'Bearer admin-test-token');
  assert.equal(forwarded.headers.get('Origin'), 'https://preview.pages.dev');
  assert.equal(forwarded.headers.get('Idempotency-Key'), 'forwarding-test-key-12345');
  assert.equal(await forwarded.text(), body);
  assert.equal(result, upstream);
  assert.equal(result.status, 409);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(await result.text(), 'upstream response');
});

test('catalogue response preserves schema and filters actual supplier instructions', async () => {
  const request = new Request('https://preview.pages.dev/api/catalogue');
  const payload = {
    products: [
      {
        id: '2',
        name: '100$ API Claude 30D (FW)',
        desc: 'Sign up for an account at https://api.mwapi.dev/ and purchase API credits.',
        cat: 'AI',
        type: 'API',
        duration: '30 days',
        requiresEmail: false,
        stock: 3,
        unlimited: false,
        sellingUsdt: '3.75',
        sellingUsd: 3.75,
        priceNum: 393.75,
        priceInrPaise: 39375,
        priceUsd: 3.75,
        usdInr: '105',
        image: 'https://images.example/product.png',
        inStock: true,
        variants: [{
          id: 'variant-1', name: 'Standard', inStock: true,
          stock: 2, unlimited: false, priceInrPaise: 39375, priceUsd: 3.75,
        }],
      },
      {
        id: '577',
        name: '100GB Graphics File Collection',
        desc: 'A collection of graphics resources, design assets, and templates.',
        priceInrPaise: 6431,
        priceUsd: 0.61,
        inStock: true,
        variants: [],
      },
    ],
    count: 2,
    pricing: { usdInr: '105' },
    stale: false,
    purchasable: true,
  };
  let forwarded;
  const upstream = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });

  const response = await forwardApi({
    request,
    env: { SOFTBAZZAR_API: { fetch: (value) => { forwarded = value; return upstream; } } },
  });
  const result = await response.json();

  assert.equal(forwarded, request);
  assert.equal(result.count, payload.count);
  assert.deepEqual(result.pricing, payload.pricing);
  assert.equal(result.stale, false);
  assert.equal(result.purchasable, true);
  assert.deepEqual(result.products[0], {
    ...payload.products[0],
    desc: 'Supplier notes withheld pending merchant review.',
  });
  assert.equal(result.products[1].desc, payload.products[1].desc);
  assert.deepEqual(Object.keys(result.products[0]).sort(), Object.keys(payload.products[0]).sort());
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('product HTML and hashed assets come from Pages assets', async () => {
  const request = new Request('https://preview.pages.dev/product/2?campaign=test', {
    headers: { Authorization: 'Bearer should-not-forward', Cookie: 'session=private' },
  });
  const assetHtml = '<!doctype html><html><head><title>SoftBazzar</title><meta name="description" content="base"><link rel="canonical" href="https://preview.pages.dev/" data-canonical><meta property="og:title" content="base"><meta property="og:description" content="base"><meta property="og:url" content="https://preview.pages.dev/"></head><body><script type="module" crossorigin src="/assets/index-abc123.js"></script></body></html>';
  let catalogueRequest;
  const response = await renderProduct({
    request,
    env: {
      SOFTBAZZAR_API: {
        fetch: (value) => {
          catalogueRequest = value;
          return Promise.resolve(new Response(JSON.stringify({ products: [{
            id: '2', name: 'Product & Plan', desc: 'Pay using a seller payment bot at https://supplier.example/order',
            cat: 'AI', priceInrPaise: 12345, inStock: true,
          }] }), { headers: { 'Content-Type': 'application/json' } }));
        },
      },
    },
    next: () => new Response(assetHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'self'",
      },
    }),
  });
  const html = await response.text();

  assert.equal(new URL(catalogueRequest.url).pathname, '/api/catalogue');
  assert.equal(catalogueRequest.method, 'GET');
  assert.equal(catalogueRequest.headers.get('Authorization'), null);
  assert.equal(catalogueRequest.headers.get('Cookie'), null);
  assert.match(html, /src="\/assets\/index-abc123\.js"/);
  assert.match(html, /<title>Product &amp; Plan \| SoftBazzar<\/title>/);
  assert.match(html, /content="Supplier notes withheld pending merchant review\."/);
  assert.match(html, /href="https:\/\/preview\.pages\.dev\/product\/2" data-canonical/);
  assert.match(html, /"priceCurrency":"INR","price":"123\.45"/);
  assert.match(html, /"availability":"https:\/\/schema\.org\/InStock"/);
  assert.doesNotMatch(html, /supplier\.example|seller payment bot/);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'self'");
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('product route falls back to same Pages assets without API binding', async () => {
  const asset = new Response('<!doctype html><html><head></head></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  const result = await renderProduct({
    request: new Request('https://preview.pages.dev/product/2'),
    env: {},
    next: () => asset,
  });
  assert.equal(result, asset);
});

test('API forwarding fails closed when binding is missing', async () => {
  const response = await forwardApi({
    request: new Request('https://preview.pages.dev/api/orders'),
    env: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'api_unavailable' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
