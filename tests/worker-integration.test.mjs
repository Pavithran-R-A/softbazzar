import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker, { cleanupExpiredQuotes, synchronize } from '../src/worker.js';

class SqliteStatement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new SqliteStatement(this.db, this.sql, values); }
  first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  run() { const result = this.db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
}

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of ['0001_init.sql', '0002_orders_payments.sql', '0003_financial_guards.sql', '0004_catalogue_variants.sql', '0005_fx_provenance.sql', '0006_fx_rate_history.sql', '0007_quote_stock_reservations.sql', '0008_fixed_merchant_pricing.sql']) {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
  }
  prepare(sql) { return new SqliteStatement(this.sqlite, sql); }
  batch(statements) {
    this.sqlite.exec('BEGIN;');
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK;');
      throw error;
    }
  }
}

const rows = [
  { id: 'sku-email', name: 'Email product', description: 'Delivery by email', your_cost: '10', stock_quantity: 3, requires_email: true, type: 'AI' },
  { id: 'sku-unlimited', name: 'Unlimited product', your_cost: '1.25', stock_quantity: 0, is_unlimited: true, type: 'AI' },
];

async function createEnv() {
  const DB = new SqliteD1();
  return {
    DB,
    ASSETS: { fetch: async () => new Response('<!doctype html><html><head><title>SoftBazzar</title><meta name="description" content="base"><link rel="canonical" href="https://example.test/"></head><body></body></html>') },
    AITOOLSHOP_API_KEY: 'fixture-secret',
    ADMIN_TOKEN: 'admin-test-token',
    YOUPI_WEBHOOK_SECRET: 'webhook-test-secret',
    STALE_CATALOGUE_MINUTES: '10',
    SUPPLIER_PURCHASES_ENABLED: 'false',
    YOUPI_LIVE_ENABLED: 'false',
    QUOTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
}

const supplierResponse = (products) => new Response(JSON.stringify({ success: true, count: products.length, products }));
const request = (path, init = {}) => new Request(`https://softbazzar-staging.example${path}`, {
  ...init,
  headers: { 'cf-connecting-ip': '198.51.100.20', ...(init.headers || {}) },
});

test('scheduled catalogue sync imports, replaces, and preserves last-good data', async () => {
  const env = await createEnv();
  const initial = await synchronize(env, async () => supplierResponse(rows));
  assert.deepEqual(initial, { imported: 2, updated: 0, removed: 0 });
  const changed = await synchronize(env, async () => supplierResponse([{ ...rows[0], your_cost: '12', stock_quantity: 1 }]));
  assert.deepEqual(changed, { imported: 0, updated: 1, removed: 1 });
  const outage = await synchronize(env, async () => new Response('upstream unavailable', { status: 503 }));
  assert.deepEqual(outage, { error: 'sync_failed' });
  const current = await env.DB.prepare('SELECT supplier_id,cost_usdt,stock,active FROM products ORDER BY supplier_id').all();
  assert.deepEqual(current.results.map((row) => [row.supplier_id, row.cost_usdt, row.stock, row.active]), [['sku-email', '12', 1, 1], ['sku-unlimited', '1.25', null, 0]]);
  env.DB.sqlite.close();
});

test('overlapping scheduled catalogue jobs skip safely', async () => {
  const env = await createEnv();
  let startedResolve;
  let releaseResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  const first = synchronize(env, async () => { startedResolve(); await release; return supplierResponse(rows); });
  await started;
  const overlap = await synchronize(env, async () => supplierResponse(rows));
  assert.deepEqual(overlap, { skipped: true, reason: 'sync_already_running' });
  releaseResolve();
  assert.equal((await first).imported, 2);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM sync_runs WHERE status='running'").first().count, 0);
  env.DB.sqlite.close();
});

test('missing supplier credentials skip without fake syncs', async () => {
  const env = await createEnv();
  delete env.AITOOLSHOP_API_KEY;
  let requested = false;
  const result = await synchronize(env, async () => { requested = true; return supplierResponse(rows); });
  assert.deepEqual(result, { skipped: true, reason: 'supplier_not_configured' });
  assert.equal(requested, false);
  const skipped=env.DB.prepare('SELECT status,error_code FROM sync_runs').first();
  assert.deepEqual({...skipped},{status:'skipped',error_code:'supplier_not_configured'});
  env.DB.sqlite.close();
});

test('catalogue preserves safe imagery and variants without exposing costs', async () => {
  const env=await createEnv();
  const rich=[{...rows[0],image_url:'https://images.example.test/item.webp',variants:[{id:'monthly',name:'Monthly',your_cost:'2',stock_quantity:4},{id:'annual',name:'Annual',your_cost:'10',stock_quantity:0}]}];
  await synchronize(env,async()=>supplierResponse(rich));
  const response=await worker.fetch(request('/api/catalogue'),env);
  const body=await response.json();
  assert.equal(body.products[0].image,'https://images.example.test/item.webp');
  assert.deepEqual(body.products[0].variants.map(({id,inStock,priceInrPaise})=>({id,inStock,priceInrPaise})),[
    {id:'monthly',inStock:true,priceInrPaise:26250},{id:'annual',inStock:false,priceInrPaise:131250},
  ]);
  assert.doesNotMatch(JSON.stringify(body),/costUsdt|your_cost|cost_usdt|supplierCost/i);
  const quoteResponse=await worker.fetch(request('/api/orders',{method:'POST',headers:{Origin:'https://softbazzar-staging.example','Content-Type':'application/json','Idempotency-Key':'variant_quote_key_123456'},body:JSON.stringify({customerEmail:'buyer@example.com',items:[{productId:'sku-email',variantId:'monthly',quantity:1}]})}),env);
  assert.equal(quoteResponse.status,201);
  const quote=await quoteResponse.json();
  assert.equal(quote.totalPaise,26250);
  assert.equal(quote.approxUsdTotalCents,250);
  assert.equal(quote.merchantUsdInr,'105');
  const variantLine=await env.DB.prepare('SELECT id,supplier_variant_id,name_snapshot,supplier_cost_usdt FROM order_lines WHERE order_id=?').bind(quote.orderId).first();
  assert.equal(variantLine.supplier_variant_id,'monthly');
  assert.equal(variantLine.name_snapshot,'Email product — Monthly');
  assert.equal(variantLine.supplier_cost_usdt,'2');
  const quoteSnapshot=await env.DB.prepare('SELECT total_paise,merchant_usd_inr,fx_usdt_inr,fx_usdt_usd FROM orders WHERE id=?').bind(quote.orderId).first();
  assert.deepEqual({...quoteSnapshot},{total_paise:26250,merchant_usd_inr:'105',fx_usdt_inr:'105',fx_usdt_usd:'1'});
  const linePricing=await env.DB.prepare('SELECT merchant_usd_inr,unit_price_paise,approx_usd_cents FROM pricing_snapshots WHERE order_line_id=?').bind(variantLine.id).first();
  assert.deepEqual({...linePricing},{merchant_usd_inr:'105',unit_price_paise:26250,approx_usd_cents:250});
  const quoteWith = (key, item) => worker.fetch(request('/api/orders',{method:'POST',headers:{Origin:'https://softbazzar-staging.example','Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({customerEmail:'buyer@example.com',items:[item]})}),env);
  const missing=await quoteWith('variant_missing_key_123456',{productId:'sku-email',quantity:1});
  assert.equal(missing.status,400);
  assert.equal((await missing.json()).error,'variant_required');
  const unknown=await quoteWith('variant_unknown_key_123456',{productId:'sku-email',variantId:'bogus',quantity:1});
  assert.equal(unknown.status,409);
  assert.equal((await unknown.json()).error,'variant_unavailable');
  const unavailable=await quoteWith('variant_stock_key_123456',{productId:'sku-email',variantId:'annual',quantity:1});
  assert.equal(unavailable.status,409);
  assert.equal((await unavailable.json()).error,'insufficient_stock');
  const unauthorizedStatus=await worker.fetch(request(`/api/orders/${quote.orderId}`),env);
  assert.equal(unauthorizedStatus.status,404);
  const status=await worker.fetch(request(`/api/orders/${quote.orderId}`,{headers:{Authorization:'Bearer variant_quote_key_123456'}}),env);
  const publicStatus=await status.json();
  assert.equal(publicStatus.order.status,'quoted');
  assert.equal(publicStatus.order.approxUsdTotalCents,250);
  assert.equal(publicStatus.order.merchantUsdInr,'105');
  assert.equal(publicStatus.order.items[0].approxUsdCents,250);
  assert.equal(Object.hasOwn(publicStatus.order,'customerEmail'),false);
  assert.equal(Object.hasOwn(publicStatus.order,'email'),false);
  env.DB.sqlite.close();
});

test('catalogue and metadata withhold unsafe supplier instructions', async () => {
  const env = await createEnv();
  const unsafe = {
    ...rows[0],
    id: 'unsafe-offer',
    name: 'Unsafe offer',
    description: 'Pay in the bot. Send screenshots to @unknownSeller https://bad.example',
  };
  await synchronize(env, async () => supplierResponse([unsafe]));
  const catalogue = await (await worker.fetch(request('/api/catalogue'), env)).json();
  assert.equal(catalogue.products[0].desc, 'Supplier notes withheld pending merchant review.');
  const page = await worker.fetch(request('/product/unsafe-offer'), env);
  const html = await page.text();
  assert.match(html, /Supplier notes withheld pending merchant review/);
  assert.doesNotMatch(html, /unknownSeller|bad\.example|Send screenshots|Pay in the bot/);
  env.DB.sqlite.close();
});

test('admin monitoring is protected and exposes operational views', async()=>{
  const env=await createEnv();
  delete env.AITOOLSHOP_API_KEY;
  await synchronize(env);
  const unauthorized=await worker.fetch(request('/api/admin/overview'),env);
  assert.equal(unauthorized.status,401);
  for (const path of ['/api/admin/orders','/api/admin/sync-runs','/api/admin/pricing','/api/admin/sync','/api/admin/orders/order-test/verify-payment']) {
    const denied=await worker.fetch(request(path,{method:path.endsWith('/sync')||path.endsWith('/verify-payment')?'POST':'GET'}),env);
    assert.equal(denied.status,401,path);
  }
  const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`};
  const overview=await worker.fetch(request('/api/admin/overview',{headers}),env);
  assert.equal(overview.status,200);
  const data=await overview.json();
  assert.equal(data.supplierConfigured,false);
  assert.equal(data.syncRuns[0].status,'skipped');
  const runs=await worker.fetch(request('/api/admin/sync-runs',{headers}),env);
  assert.equal((await runs.json()).syncRuns.length,1);
  const pricing=await worker.fetch(request('/api/admin/pricing',{headers}),env);
  assert.equal((await pricing.json()).pricing.usdInr,'105');
  const changed=await worker.fetch(request('/api/admin/pricing',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({usdInr:'106',reason:'Owner-approved pricing test'})}),env);
  assert.equal(changed.status,200);
  const history=await (await worker.fetch(request('/api/admin/pricing',{headers}),env)).json();
  assert.equal(history.history[0].previousUsdInr,'105');
  assert.equal(history.history[0].usdInr,'106');
  const tooShort=await worker.fetch(request('/api/admin/pricing',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({usdInr:'107',reason:'ok'})}),env);
  assert.equal(tooShort.status,400);
  const manualSync=await worker.fetch(request('/api/admin/sync',{method:'POST',headers}),env);
  assert.equal(manualSync.status,200);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type='manual_catalogue_sync'").first().count,1);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM admin_actions WHERE action='manual_catalogue_sync'").first().count,1);
  env.DB.sqlite.close();
});

test('large cart quantities use paise-safe fixed conversion',async()=>{
  const env=await createEnv();
  await synchronize(env,async()=>supplierResponse(rows));
  const quote=await worker.fetch(request('/api/orders',{method:'POST',headers:{Origin:'https://softbazzar-staging.example','Content-Type':'application/json','Idempotency-Key':'large_quantity_fixed_rate'},body:JSON.stringify({items:[{productId:'sku-unlimited',quantity:99}]})}),env);
  assert.equal(quote.status,201);
  const result=await quote.json();
  assert.equal(result.totalPaise,1624194);
  const stored=await env.DB.prepare('SELECT total_paise,merchant_usd_inr FROM orders WHERE id=?').bind(result.orderId).first();
  assert.equal(stored.total_paise,16406*99);
  assert.equal(stored.merchant_usd_inr,'105');
  env.DB.sqlite.close();
});

test('catalogue, required email, stock, quote locking, and expiry', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const catalogue = await worker.fetch(request('/api/catalogue'), env);
  const body = await catalogue.json();
  assert.equal(body.count, 2);
  assert.equal(body.products.find(({ id }) => id === 'sku-email').priceInrPaise, 131250);
  assert.equal(body.products.find(({ id }) => id === 'sku-email').priceUsd, 12.5);
  const publicProducts = JSON.stringify(body);
  assert.doesNotMatch(publicProducts, /supplierCostUsdt|your_cost|cost_usdt|reseller.?balance/i);
  assert.equal(Object.hasOwn(body.products.find(({ id }) => id === 'sku-email'), 'supplierCostUsdt'), false);
  assert.equal(body.products.find(({ id }) => id === 'sku-email').requiresEmail, true);
  assert.equal(body.products.find(({ id }) => id === 'sku-unlimited').unlimited, true);
  const headers = { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'checkout_key_1234567890' };
  const noEmail = await worker.fetch(request('/api/orders', { method: 'POST', headers, body: JSON.stringify({ items: [{ productId: 'sku-email', quantity: 1 }] }) }), env);
  assert.equal(noEmail.status, 400);
  assert.equal((await noEmail.json()).error, 'customer_email_required');
  const invalidEmail = await worker.fetch(request('/api/orders', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'invalid_email_123456' }, body: JSON.stringify({ customerEmail: 'invalid', items: [{ productId: 'sku-email', quantity: 1 }] }) }), env);
  assert.equal(invalidEmail.status, 400);
  assert.equal((await invalidEmail.json()).error, 'invalid_email');
  const noStock = await worker.fetch(request('/api/orders', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'checkout_key_0987654321' }, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 4 }] }) }), env);
  assert.equal(noStock.status, 409);
  const create = () => worker.fetch(request('/api/orders', { method: 'POST', headers, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }) }), env);
  const first = await create();
  const quote = await first.json();
  assert.equal(first.status, 201);
  assert.equal(quote.totalPaise, 131250);
  const anonymousStatus = await worker.fetch(request(`/api/orders/${quote.orderId}`), env);
  assert.equal(anonymousStatus.status, 404);
  const authorizedStatus = await worker.fetch(request(`/api/orders/${quote.orderId}`, { headers: { Authorization: `Bearer ${headers['Idempotency-Key']}` } }), env);
  assert.equal(authorizedStatus.status, 200);
  assert.equal(Object.hasOwn(await authorizedStatus.json(), 'customerEmail'), false);
  const repeated = await create();
  assert.equal((await repeated.json()).orderId, quote.orderId);
  const parallelHeaders={...headers,'Idempotency-Key':'parallel_quote_key_12345'};
  const concurrent=await Promise.all([1,2,3].map(()=>worker.fetch(request('/api/orders',{method:'POST',headers:parallelHeaders,body:JSON.stringify({customerEmail:'person@example.com',items:[{productId:'sku-unlimited',quantity:1}]})}),env)));
  const parallel=await Promise.all(concurrent.map((response)=>response.json()));
  assert.equal(new Set(parallel.map((order)=>order.orderId)).size,1);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE idempotency_key='parallel_quote_key_12345'").first().count,1);
  const competingQuote=(key)=>worker.fetch(request('/api/orders',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify({customerEmail:'person@example.com',items:[{productId:'sku-email',quantity:2}]})}),env);
  const competing=await Promise.all([competingQuote('competing_quote_key_A123'),competingQuote('competing_quote_key_B123')]);
  assert.deepEqual(competing.map((response)=>response.status).sort(),[201,409]);
  assert.equal(env.DB.prepare("SELECT SUM(quantity) AS count FROM quote_stock_reservations WHERE supplier_id='sku-email' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").first().count,3);
  const conflict = await worker.fetch(request('/api/orders', { method: 'POST', headers, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 2 }] }) }), env);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'idempotency_conflict');
  const expiredKey = 'expired_key_1234567890';
  const requestHash = createHash('sha256').update(JSON.stringify({ email: 'person@example.com', items: [['sku-email', 1]] })).digest('hex');
  await env.DB.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at,merchant_usd_inr) VALUES('expired-order',?,?,'quoted','person@example.com','INR',131250,'105','1',?,?,?,'105')")
    .bind(expiredKey, requestHash, new Date(Date.now() - 1000).toISOString(), new Date().toISOString(), new Date().toISOString()).run();
  const expired = await worker.fetch(request('/api/orders', { method: 'POST', headers: { ...headers, 'Idempotency-Key': expiredKey }, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }) }), env);
  assert.equal(expired.status, 410);
  assert.equal((await env.DB.prepare("SELECT status FROM orders WHERE id='expired-order'").first()).status, 'cancelled');
  const cancelledKey = 'cancelled_key_123456789';
  const cancelledHash = createHash('sha256').update(JSON.stringify({ email: '', items: [['sku-unlimited', 1]] })).digest('hex');
  await env.DB.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at,merchant_usd_inr) VALUES('cancelled-order',?,?,'cancelled',NULL,'INR',13125,'105','1',?,?,?,'105')")
    .bind(cancelledKey, cancelledHash, new Date(Date.now() - 1000).toISOString(), new Date().toISOString(), new Date().toISOString()).run();
  const cancelledReplay = await worker.fetch(request('/api/orders', { method: 'POST', headers: { ...headers, 'Idempotency-Key': cancelledKey }, body: JSON.stringify({ items: [{ productId: 'sku-unlimited', quantity: 1 }] }) }), env);
  assert.equal(cancelledReplay.status, 410);
  assert.equal((await cancelledReplay.json()).error, 'quote_not_active');
  env.DB.sqlite.close();
});

test('idempotency race rejects a different request hash', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const key = 'race_different_request_123';
  const requestBody = { items: [{ productId: 'sku-unlimited', quantity: 1 }] };
  const requestHash = createHash('sha256').update(JSON.stringify({ email: '', items: [['sku-unlimited', 1]] })).digest('hex');
  const originalBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = (statements) => {
    env.DB.sqlite.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at,merchant_usd_inr) VALUES('raced-order',?,'different-hash','quoted',NULL,'INR',13125,'105','1',?,?,?,'105')")
      .run(key, new Date(Date.now() + 300000).toISOString(), new Date().toISOString(), new Date().toISOString());
    return originalBatch(statements);
  };
  const response = await worker.fetch(request('/api/orders', { method: 'POST', headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(requestBody) }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'idempotency_conflict');
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM orders').first().count, 1);
  assert.notEqual(requestHash, 'different-hash');
  env.DB.sqlite.close();
});

test('same-key retries return the reserved quote during stock races', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const key = 'same_key_stock_race_12345';
  const create = () => worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 3 }] }),
  }), env);
  const responses = await Promise.all([create(), create(), create()]);
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.ok(responses.every((response) => response.ok));
  assert.equal(new Set(results.map((result) => result.orderId)).size, 1);
  assert.equal(env.DB.prepare("SELECT SUM(quantity) AS quantity FROM quote_stock_reservations WHERE supplier_id='sku-email'").first().quantity, 3);
  env.DB.sqlite.close();
});

test('quote requests enforce Cloudflare rate limits', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  env.QUOTE_RATE_LIMITER.limit = async () => ({ success: false });
  const response = await worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'rate_limited_quote_12345' },
    body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }),
  }), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM orders').first().count, 0);
  env.DB.sqlite.close();
});

test('quote creation fails closed without its rate-limit binding', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  delete env.QUOTE_RATE_LIMITER;
  const response = await worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'missing_limiter_key_12345' },
    body: JSON.stringify({ items: [{ productId: 'sku-unlimited', quantity: 1 }] }),
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'quote_protection_unavailable');
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM orders').first().count, 0);
  env.DB.sqlite.close();
});

test('out-of-stock supplier products cannot be quoted', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse([{ id: 'sku-empty', name: 'Empty stock', your_cost: '1', stock_quantity: 0 }]));
  const catalogue = await (await worker.fetch(request('/api/catalogue'), env)).json();
  assert.equal(catalogue.products[0].inStock, false);
  const response = await worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'out_of_stock_quote_12345' },
    body: JSON.stringify({ items: [{ productId: 'sku-empty', quantity: 1 }] }),
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'insufficient_stock');
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM orders').first().count, 0);
  env.DB.sqlite.close();
});

test('unsafe supplier descriptions stay out of product metadata', async () => {
  const env = await createEnv();
  const malicious = [{ ...rows[0], description: '<img src=x onerror="alert(1)"><a href="javascript:alert(2)">claim</a>' }];
  await synchronize(env, async () => supplierResponse(malicious));
  const response = await worker.fetch(request('/product/sku-email'), env);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Supplier notes withheld pending merchant review/);
  assert.doesNotMatch(html, /onerror|javascript:|alert\(1\)/i);
  env.DB.sqlite.close();
});

test('scheduled cleanup cancels expired quotes and releases stock', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO orders(id,idempotency_key,status,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at,merchant_usd_inr) VALUES('expired-cleanup','expired_cleanup_key_12345','quoted','INR',131250,'105','1',?,?,?,'105')")
    .bind(new Date(Date.now() - 1000).toISOString(), now, now).run();
  await env.DB.prepare("INSERT INTO order_lines(id,order_id,supplier_product_id,name_snapshot,quantity,unit_price_paise,supplier_cost_usdt,supplier_idempotency_key) VALUES('expired-line','expired-cleanup','sku-email','Email product',1,131250,'10','expired-supplier-key')").run();
  await env.DB.prepare("INSERT INTO quote_stock_reservations(order_line_id,order_id,supplier_id,quantity,expires_at) VALUES('expired-line','expired-cleanup','sku-email',1,?)").bind(new Date(Date.now() - 1000).toISOString()).run();
  await cleanupExpiredQuotes(env);
  assert.equal(env.DB.prepare("SELECT status FROM orders WHERE id='expired-cleanup'").first().status, 'cancelled');
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM quote_stock_reservations WHERE order_id='expired-cleanup'").first().count, 0);
  env.DB.sqlite.close();
});

test('stale catalogue disables quote creation and live routes', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  await env.DB.prepare("UPDATE sync_runs SET finished_at=? WHERE status='success'").bind(new Date(Date.now() - 11 * 60_000).toISOString()).run();
  const stale = await worker.fetch(request('/api/catalogue'), env);
  assert.equal((await stale.json()).stale, true);
  const quote = await worker.fetch(request('/api/orders', { method: 'POST', headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'stale_key_1234567890' }, body: JSON.stringify({ items: [{ productId: 'sku-unlimited', quantity: 1 }] }) }), env);
  assert.equal(quote.status, 503);
  const payment = await worker.fetch(request('/api/orders/order-1/payments', { method: 'POST' }), env);
  assert.equal(payment.status, 503);
  const health = await worker.fetch(request('/api/health'), env);
  const status = await health.json();
  assert.equal(status.supplierConfigured, true);
  assert.equal(status.livePaymentsEnabled, false);
  assert.equal(status.supplierPurchasesEnabled, false);
  const publicHealth = JSON.stringify(status);
  assert.doesNotMatch(publicHealth, /fixture-secret|admin-test-token|webhook-test-secret/);
  env.DB.sqlite.close();
});

test('legacy exchange-rate rows cannot block fixed pricing', async()=>{
  const env=await createEnv();
  await synchronize(env,async()=>supplierResponse(rows));
  await env.DB.prepare('INSERT INTO fx_rates(id,usdt_inr,usdt_usd,updated_at,updated_by) VALUES(1,?,?,?,?)').bind('1','0.5',new Date(Date.now()-365*86400000).toISOString(),'legacy').run();
  const catalogue=await worker.fetch(request('/api/catalogue'),env);
  const state=await catalogue.json();
  assert.equal(state.stale,false);
  assert.equal(state.purchasable,true);
  assert.equal(state.products.find(({id})=>id==='sku-email').priceInrPaise,131250);
  const quote=await worker.fetch(request('/api/orders',{method:'POST',headers:{Origin:'https://softbazzar-staging.example','Content-Type':'application/json','Idempotency-Key':'expired_fx_quote_key123'},body:JSON.stringify({customerEmail:'buyer@example.com',items:[{productId:'sku-email',quantity:1}]})}),env);
  assert.equal(quote.status,201);
  assert.equal((await quote.json()).totalPaise,131250);
  env.DB.sqlite.close();
});

test('staging responses block indexing and sitemap discovery', async () => {
  const env = await createEnv();
  env.STAGING_ENV = 'true';
  const home = await worker.fetch(request('/'), env);
  assert.equal(home.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const robots = await worker.fetch(request('/robots.txt'), env);
  assert.equal(robots.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(await robots.text(), /Disallow: \/\n/);
  const api=await worker.fetch(request('/api/health'),env);
  assert.equal(api.headers.get('X-Robots-Tag'),'noindex, nofollow');
  assert.equal(api.headers.get('X-Frame-Options'),'DENY');
  const sitemap = await worker.fetch(request('/sitemap.xml'), env);
  assert.equal(sitemap.status, 404);
  env.DB.sqlite.close();
});

test('signed UPI observations remain pending until bank review', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const quoteResponse = await worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'youpi_key_1234567890' },
    body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }),
  }), env);
  const quote = await quoteResponse.json();
  await env.DB.prepare("UPDATE orders SET status='awaiting_payment' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE orders SET status='verification_pending' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("INSERT INTO payment_attempts(id,order_id,gateway,gateway_payment_id,state,amount_paise,created_at,updated_at) VALUES('attempt-1',?,'youpi','gateway-1','pending',?,?,?)")
    .bind(quote.orderId, quote.totalPaise, new Date().toISOString(), new Date().toISOString()).run();

  const timestamp = String(Date.now());
  const event = { deliveryId: 'delivery-123456', timestamp, event: 'OBSERVED_SUCCESS', method: 'UPI', orderId: quote.orderId, paymentId: 'gateway-1', amountPaise: quote.totalPaise };
  const rawBody = JSON.stringify(event);
  const signature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const headers = { 'Content-Type': 'application/json', 'X-Gateway-Timestamp': timestamp, 'X-Gateway-Delivery-Id': event.deliveryId, 'X-Gateway-Event': event.event, 'X-Gateway-Signature-V2': signature };
  const webhook = () => worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers, body: rawBody }), env);
  const accepted = await webhook();
  assert.equal(accepted.status, 200);
  assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(quote.orderId).first()).status, 'verification_pending');
  assert.equal((await webhook().then((response) => response.json())).duplicate, true);
  const v1Event = { ...event, deliveryId: 'delivery-v1-123456' };
  delete v1Event.timestamp;
  const v1Body = JSON.stringify(v1Event);
  const v1Signature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(v1Body).digest('hex')}`;
  const v1Response = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { ...headers, 'X-Gateway-Delivery-Id': v1Event.deliveryId, 'X-Gateway-Signature-V2': '', 'X-Gateway-Signature': v1Signature }, body: v1Body }), env);
  assert.equal(v1Response.status, 200);
  const conflictEvent = { ...event, amountPaise: event.amountPaise + 1 };
  const conflictBody = JSON.stringify(conflictEvent);
  const conflictSignature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(`${timestamp}.${conflictBody}`).digest('hex')}`;
  const conflictDelivery = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { ...headers, 'X-Gateway-Signature-V2': conflictSignature }, body: conflictBody }), env);
  assert.equal(conflictDelivery.status, 409);
  const reconciled = { ...event, deliveryId: 'delivery-234567', event: 'RECONCILED', settlementState: 'RECONCILED' };
  const reconciledBody = JSON.stringify(reconciled);
  const reconciledSignature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(`${timestamp}.${reconciledBody}`).digest('hex')}`;
  const reconciledResponse = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { ...headers, 'X-Gateway-Delivery-Id': reconciled.deliveryId, 'X-Gateway-Event': reconciled.event, 'X-Gateway-Signature-V2': reconciledSignature }, body: reconciledBody }), env);
  assert.equal(reconciledResponse.status, 200);
  assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(quote.orderId).first()).status, 'verification_pending');
  const spoof = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { ...headers, 'X-Gateway-Signature-V2': 'sha256=' + '0'.repeat(64) }, body: rawBody }), env);
  assert.equal(spoof.status, 401);
  const unauthorized = await worker.fetch(request(`/api/admin/orders/${quote.orderId}/verify-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' }, body: '{}' }), env);
  assert.equal(unauthorized.status, 401);
  const verify = await worker.fetch(request(`/api/admin/orders/${quote.orderId}/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ADMIN_TOKEN}` },
    body: JSON.stringify({ bankRecordReference: 'bank-ref-123456', amountPaise: quote.totalPaise, bankRecordDate: new Date().toISOString() }),
  }), env);
  assert.equal(verify.status, 200);
  assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(quote.orderId).first()).status, 'payment_verified');
  assert.equal((await webhook().then((response) => response.json())).duplicate, true);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type='payment_verified'").first().count, 1);
  env.DB.sqlite.close();
});

test('signed payment amount mismatch enters manual review', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const quoteResponse = await worker.fetch(request('/api/orders', {
    method: 'POST',
    headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': 'mismatch_key_12345678' },
    body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }),
  }), env);
  const quote = await quoteResponse.json();
  await env.DB.prepare("UPDATE orders SET status='awaiting_payment' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE orders SET status='verification_pending' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("INSERT INTO payment_attempts(id,order_id,gateway,gateway_payment_id,state,amount_paise,created_at,updated_at) VALUES('attempt-mismatch',?,'youpi','gateway-mismatch','pending',?,?,?)")
    .bind(quote.orderId, quote.totalPaise, new Date().toISOString(), new Date().toISOString()).run();
  const timestamp = String(Date.now());
  const event = { deliveryId: 'delivery-mismatch-1', timestamp, event: 'OBSERVED_SUCCESS', method: 'UPI', orderId: quote.orderId, paymentId: 'gateway-mismatch', amountPaise: 1 };
  const rawBody = JSON.stringify(event);
  const signature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const response = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Timestamp': timestamp, 'X-Gateway-Delivery-Id': event.deliveryId, 'X-Gateway-Event': event.event, 'X-Gateway-Signature-V2': signature }, body: rawBody }), env);
  assert.equal(response.status, 200);
  assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(quote.orderId).first()).status, 'manual_review');
  env.DB.sqlite.close();
});

test('mock lifecycle covers cancellation, balance failure, delivery failure, and refund', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const makeQuote = async (key) => {
    const response = await worker.fetch(request('/api/orders', {
      method: 'POST',
      headers: { Origin: 'https://softbazzar-staging.example', 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ items: [{ productId: 'sku-unlimited', quantity: 1 }] }),
    }), env);
    assert.equal(response.status, 201);
    return response.json();
  };
  const cancelled = await makeQuote('cancelled_simulation_key_123');
  await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(cancelled.orderId).run();
  await env.DB.prepare("INSERT INTO payment_attempts(id,order_id,gateway,gateway_payment_id,state,amount_paise,created_at,updated_at) VALUES('cancelled-attempt',?,'youpi','cancelled-payment','pending',?,?,?)")
    .bind(cancelled.orderId, cancelled.totalPaise, new Date().toISOString(), new Date().toISOString()).run();
  const timestamp = String(Date.now());
  const event = { deliveryId: 'cancelled-delivery-123', timestamp, event: 'OBSERVED_SUCCESS', method: 'UPI', orderId: cancelled.orderId, paymentId: 'cancelled-payment', amountPaise: cancelled.totalPaise };
  const raw = JSON.stringify(event);
  const signature = `sha256=${createHmac('sha256', env.YOUPI_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex')}`;
  const callback = await worker.fetch(request('/api/webhooks/youpi', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Timestamp': timestamp, 'X-Gateway-Delivery-Id': event.deliveryId, 'X-Gateway-Event': event.event, 'X-Gateway-Signature-V2': signature }, body: raw }), env);
  assert.equal(callback.status, 409);

  const quote = await makeQuote('fulfillment_simulation_key_123');
  await env.DB.prepare("UPDATE orders SET status='awaiting_payment' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE orders SET status='verification_pending' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("INSERT INTO payment_attempts(id,order_id,gateway,gateway_payment_id,state,amount_paise,created_at,updated_at) VALUES('sim-attempt',?,'youpi','sim-payment','pending',?,?,?)")
    .bind(quote.orderId, quote.totalPaise, new Date().toISOString(), new Date().toISOString()).run();
  const verified = await worker.fetch(request(`/api/admin/orders/${quote.orderId}/verify-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankRecordReference: 'sim-bank-ref-0001', amountPaise: quote.totalPaise, bankRecordDate: new Date().toISOString() }),
  }), env);
  assert.equal(verified.status, 200);
  await env.DB.prepare("UPDATE orders SET status='supplier_purchase_pending' WHERE id=?").bind(quote.orderId).run();
  const line = await env.DB.prepare('SELECT id FROM order_lines WHERE order_id=?').bind(quote.orderId).first();
  await env.DB.prepare("INSERT INTO supplier_fulfilments(id,order_line_id,state,attempts,updated_at) VALUES('sim-fulfilment',?,'insufficient_balance',1,?)")
    .bind(line.id, new Date().toISOString()).run();
  await env.DB.prepare("UPDATE orders SET status='fulfilment_failed' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("INSERT INTO audit_events(id,event_type,subject_id,details_json,created_at) VALUES('sim-balance-event','supplier_balance_insufficient',?,'{}',?)")
    .bind(quote.orderId, new Date().toISOString()).run();
  await env.DB.prepare("UPDATE orders SET status='supplier_purchase_pending' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE supplier_fulfilments SET state='supplier_pending',attempts=attempts+1,updated_at=? WHERE id='sim-fulfilment'").bind(new Date().toISOString()).run();
  await env.DB.prepare("UPDATE orders SET status='supplier_pending' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE supplier_fulfilments SET state='delivery_failed',attempts=attempts+1,updated_at=? WHERE id='sim-fulfilment'").bind(new Date().toISOString()).run();
  await env.DB.prepare("UPDATE orders SET status='fulfilment_failed' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("UPDATE orders SET status='refunded' WHERE id=?").bind(quote.orderId).run();
  await env.DB.prepare("INSERT INTO audit_events(id,event_type,subject_id,details_json,created_at) VALUES('sim-refund-event','refund_simulated',?,'{}',?)")
    .bind(quote.orderId, new Date().toISOString()).run();
  assert.equal(env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(quote.orderId).first().status, 'refunded');
  assert.deepEqual({ ...env.DB.prepare("SELECT state,attempts FROM supplier_fulfilments WHERE id='sim-fulfilment'").first() }, { state: 'delivery_failed', attempts: 3 });
  assert.equal(env.SUPPLIER_PURCHASES_ENABLED, 'false');
  assert.equal(env.YOUPI_LIVE_ENABLED, 'false');
  env.DB.sqlite.close();
});
