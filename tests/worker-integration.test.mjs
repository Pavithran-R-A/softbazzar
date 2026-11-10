import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker, { synchronize } from '../src/worker.js';

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
    for (const migration of ['0001_init.sql', '0002_orders_payments.sql', '0003_financial_guards.sql']) {
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
  await DB.prepare('INSERT INTO fx_rates(id,usdt_inr,usdt_usd,updated_at,updated_by) VALUES(1,?,?,?,?)')
    .bind('90', '1', new Date().toISOString(), 'test').run();
  return {
    DB,
    ASSETS: { fetch: async () => new Response('<!doctype html><html><head><title>SoftBazzar</title><meta name="description" content="base"><link rel="canonical" href="https://example.test/"></head><body></body></html>') },
    AITOOLSHOP_API_KEY: 'fixture-secret',
    ADMIN_TOKEN: 'admin-test-token',
    YOUPI_WEBHOOK_SECRET: 'webhook-test-secret',
    STALE_CATALOGUE_MINUTES: '10',
    SUPPLIER_PURCHASES_ENABLED: 'false',
    YOUPI_LIVE_ENABLED: 'false',
  };
}

const supplierResponse = (products) => new Response(JSON.stringify({ success: true, count: products.length, products }));
const request = (path, init = {}) => new Request(`https://softbazzar-staging.example${path}`, init);

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
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM sync_runs').first().count, 0);
  env.DB.sqlite.close();
});

test('catalogue, required email, stock, quote locking, and expiry', async () => {
  const env = await createEnv();
  await synchronize(env, async () => supplierResponse(rows));
  const catalogue = await worker.fetch(request('/api/catalogue'), env);
  const body = await catalogue.json();
  assert.equal(body.count, 2);
  assert.equal(body.products.find(({ id }) => id === 'sku-email').priceInrPaise, 112500);
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
  assert.equal(quote.totalPaise, 112500);
  const repeated = await create();
  assert.equal((await repeated.json()).orderId, quote.orderId);
  const conflict = await worker.fetch(request('/api/orders', { method: 'POST', headers, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 2 }] }) }), env);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'idempotency_conflict');
  const expiredKey = 'expired_key_1234567890';
  const requestHash = createHash('sha256').update(JSON.stringify({ email: 'person@example.com', items: [['sku-email', 1]] })).digest('hex');
  await env.DB.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at) VALUES('expired-order',?,?,'quoted','person@example.com','INR',112500,'90','1',?,?,?)")
    .bind(expiredKey, requestHash, new Date(Date.now() - 1000).toISOString(), new Date().toISOString(), new Date().toISOString()).run();
  const expired = await worker.fetch(request('/api/orders', { method: 'POST', headers: { ...headers, 'Idempotency-Key': expiredKey }, body: JSON.stringify({ customerEmail: 'person@example.com', items: [{ productId: 'sku-email', quantity: 1 }] }) }), env);
  assert.equal(expired.status, 410);
  assert.equal((await env.DB.prepare("SELECT status FROM orders WHERE id='expired-order'").first()).status, 'cancelled');
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

test('staging responses block indexing and sitemap discovery', async () => {
  const env = await createEnv();
  env.STAGING_ENV = 'true';
  const home = await worker.fetch(request('/'), env);
  assert.equal(home.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const robots = await worker.fetch(request('/robots.txt'), env);
  assert.equal(robots.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(await robots.text(), /Disallow: \/\n/);
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
