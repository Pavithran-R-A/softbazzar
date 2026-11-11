import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migrationNames = [
  '0001_init.sql',
  '0002_orders_payments.sql',
  '0003_financial_guards.sql',
  '0004_catalogue_variants.sql',
  '0005_fx_provenance.sql',
];

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const name of migrationNames) {
    db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  return db;
}

function seedOrder(db, id = 'order-1', status = 'quoted') {
  db.prepare('INSERT INTO products(supplier_id,name,cost_usdt,type,updated_at) VALUES(?,?,?,?,?)')
    .run('sku-1', 'Product', '10', 'AI', '2026-11-10T00:00:00Z');
  db.prepare('INSERT INTO orders(id,idempotency_key,status,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at) VALUES(?,?,?,\'INR\',?,?,?,?,?,?)')
    .run(id, `key_${id}_unique`, status, 125000, '90', '1', '2026-11-10T00:05:00Z', '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z');
  db.prepare('INSERT INTO order_lines(id,order_id,supplier_product_id,name_snapshot,quantity,unit_price_paise,supplier_cost_usdt,supplier_idempotency_key) VALUES(?,?,?,?,?,?,?,?)')
    .run(`line-${id}`, id, 'sku-1', 'Product', 1, 125000, '10', `purchase_${id}_unique`);
  return `line-${id}`;
}

test('migrations enforce a single running sync', () => {
  const db = database();
  db.prepare("INSERT INTO sync_runs(started_at,status) VALUES(?, 'running')").run('2026-11-10T00:00:00Z');
  assert.throws(() => db.prepare("INSERT INTO sync_runs(started_at,status) VALUES(?, 'running')").run('2026-11-10T00:01:00Z'), /UNIQUE/);
  assert.doesNotThrow(() => db.prepare("INSERT INTO sync_runs(started_at,status) VALUES(?, 'failed')").run('2026-11-10T00:02:00Z'));
  db.close();
});

test('orders lock quoted amounts and idempotency keys', () => {
  const db = database();
  seedOrder(db);
  assert.throws(() => db.prepare("UPDATE orders SET total_paise=1 WHERE id='order-1'").run(), /order_quote_is_immutable/);
  assert.throws(() => db.prepare("INSERT INTO orders(id,idempotency_key,status,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at) SELECT 'order-2',idempotency_key,'quoted','INR',1,'90','1','later','now','now' FROM orders WHERE id='order-1'").run(), /UNIQUE/);
  db.close();
});

test('browser-observed payment cannot authorize fulfilment', () => {
  const db = database();
  const lineId = seedOrder(db, 'order-unpaid');
  assert.throws(() => db.prepare('INSERT INTO supplier_fulfilments(id,order_line_id,state,updated_at) VALUES(?,?,?,?)').run('fulfilment-1', lineId, 'pending', 'now'), /supplier_fulfilment_requires_verified_payment/);
  assert.throws(() => db.prepare("UPDATE orders SET status='payment_verified' WHERE id='order-unpaid'").run(), /invalid_order_state_transition|verified_payment_requires_admin_bank_evidence/);
  db.close();
});

test('admin verification requires immutable bank evidence', () => {
  const db = database();
  const lineId = seedOrder(db);
  db.prepare("UPDATE orders SET status='awaiting_payment' WHERE id='order-1'").run();
  db.prepare("UPDATE orders SET status='verification_pending' WHERE id='order-1'").run();
  db.prepare("INSERT INTO payment_attempts(id,order_id,gateway,state,amount_paise,created_at,updated_at) VALUES('attempt-1','order-1','youpi','OBSERVED_SUCCESS',125000,'now','now')").run();
  assert.throws(() => db.prepare("UPDATE orders SET status='payment_verified',verification_decision_id='decision-1' WHERE id='order-1'").run(), /verified_payment_requires_admin_bank_evidence/);
  db.prepare("INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,bank_reference_hash,received_at) VALUES('evidence-1','attempt-1','admin:decision-1','ADMIN_BANK_VERIFIED','official_bank_record_admin_decision','hash-1','reference-hash-1','now')").run();
  db.prepare("UPDATE orders SET status='payment_verified',verification_decision_id='decision-1' WHERE id='order-1'").run();
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='order-1'").get().status, 'payment_verified');
  assert.throws(() => db.prepare("UPDATE payment_evidence SET event_type='fake' WHERE id='evidence-1'").run(), /payment_evidence_is_immutable/);
  assert.throws(() => db.prepare("DELETE FROM payment_evidence WHERE id='evidence-1'").run(), /payment_evidence_is_immutable/);
  db.prepare("UPDATE orders SET status='supplier_purchase_pending' WHERE id='order-1'").run();
  assert.doesNotThrow(() => db.prepare('INSERT INTO supplier_fulfilments(id,order_line_id,state,updated_at) VALUES(?,?,?,?)').run('fulfilment-2', lineId, 'pending', 'now'));
  db.prepare("UPDATE supplier_fulfilments SET state='failed',attempts=attempts+1,updated_at='later' WHERE id='fulfilment-2'").run();
  assert.equal(db.prepare("SELECT state,attempts FROM supplier_fulfilments WHERE id='fulfilment-2'").get().state, 'failed');
  assert.equal(db.prepare("SELECT attempts FROM supplier_fulfilments WHERE id='fulfilment-2'").get().attempts, 1);
  assert.throws(() => db.prepare('INSERT INTO order_lines(id,order_id,supplier_product_id,name_snapshot,quantity,unit_price_paise,supplier_cost_usdt,supplier_idempotency_key) VALUES(?,?,?,?,?,?,?,?)').run('line-dup', 'order-1', 'sku-1', 'Product', 1, 125000, '10', 'purchase_order-1_unique'), /UNIQUE/);
  db.close();
});

test('webhook delivery IDs and bank references reject replays', () => {
  const db = database();
  seedOrder(db);
  db.prepare("INSERT INTO payment_attempts(id,order_id,gateway,state,amount_paise,created_at,updated_at) VALUES('attempt-1','order-1','youpi','OBSERVED_SUCCESS',125000,'now','now')").run();
  const insert = db.prepare('INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,bank_reference_hash,received_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('evidence-1', 'attempt-1', 'delivery-1', 'OBSERVED_SUCCESS', 'youpi_signed_webhook', 'body-hash', null, 'now');
  assert.throws(() => insert.run('evidence-2', 'attempt-1', 'delivery-1', 'OBSERVED_SUCCESS', 'youpi_signed_webhook', 'body-hash', null, 'now'), /UNIQUE/);
  db.prepare("INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,bank_reference_hash,received_at) VALUES('evidence-3','attempt-1','admin:decision-3','ADMIN_BANK_VERIFIED','official_bank_record_admin_decision','hash','bank-ref-hash','now')").run();
  assert.throws(() => db.prepare("INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,bank_reference_hash,received_at) VALUES('evidence-4','attempt-1','admin:decision-4','ADMIN_BANK_VERIFIED','official_bank_record_admin_decision','hash-2','bank-ref-hash','now')").run(), /UNIQUE/);
  db.close();
});
