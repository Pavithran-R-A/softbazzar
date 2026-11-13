CREATE TABLE orders (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('draft','quoted','awaiting_payment','verification_pending','payment_verified','supplier_purchase_pending','supplier_pending','delivered','fulfilment_failed','manual_review','cancelled','refunded','disputed')), customer_email TEXT, currency TEXT NOT NULL CHECK(currency='INR'), total_paise INTEGER NOT NULL CHECK(total_paise>0), fx_usdt_inr TEXT NOT NULL, fx_usdt_usd TEXT NOT NULL, quote_expires_at TEXT NOT NULL, verification_decision_id TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE order_lines (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), supplier_product_id TEXT NOT NULL REFERENCES products(supplier_id), name_snapshot TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), unit_price_paise INTEGER NOT NULL CHECK(unit_price_paise>0), supplier_cost_usdt TEXT NOT NULL, supplier_idempotency_key TEXT NOT NULL UNIQUE);
CREATE TABLE pricing_snapshots (order_line_id TEXT PRIMARY KEY REFERENCES order_lines(id), selling_usdt TEXT NOT NULL, fx_usdt_inr TEXT NOT NULL, fx_usdt_usd TEXT NOT NULL, quote_fx_updated_at TEXT NOT NULL, unit_price_paise INTEGER NOT NULL, approx_usd_cents INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE payment_attempts (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), gateway TEXT NOT NULL, gateway_payment_id TEXT, state TEXT NOT NULL, amount_paise INTEGER NOT NULL, utr_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX payment_gateway_id_unique ON payment_attempts(gateway,gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE TABLE payment_evidence (id TEXT PRIMARY KEY, payment_attempt_id TEXT NOT NULL REFERENCES payment_attempts(id), delivery_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, verification_source TEXT NOT NULL, evidence_hash TEXT NOT NULL, bank_reference_hash TEXT UNIQUE, received_at TEXT NOT NULL);
CREATE TABLE supplier_fulfilments (id TEXT PRIMARY KEY, order_line_id TEXT NOT NULL UNIQUE REFERENCES order_lines(id), supplier_order_ref TEXT, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE idempotency_records (scope TEXT NOT NULL, idempotency_key TEXT NOT NULL, response_hash TEXT, created_at TEXT NOT NULL, PRIMARY KEY(scope,idempotency_key));
CREATE TABLE encrypted_delivery_material (order_line_id TEXT PRIMARY KEY REFERENCES order_lines(id), ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, key_version TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE admin_actions (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE audit_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, subject_id TEXT, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX orders_status_created ON orders(status,created_at);
CREATE INDEX payment_attempts_order ON payment_attempts(order_id,created_at);
CREATE INDEX supplier_fulfilments_state ON supplier_fulfilments(state,updated_at);
CREATE TRIGGER order_state_transition_guard BEFORE UPDATE OF status ON orders
WHEN NOT (
  (OLD.status='draft' AND NEW.status IN ('quoted','cancelled')) OR
  (OLD.status='quoted' AND NEW.status IN ('awaiting_payment','cancelled')) OR
  (OLD.status='awaiting_payment' AND NEW.status IN ('verification_pending','manual_review','cancelled')) OR
  (OLD.status='verification_pending' AND NEW.status IN ('payment_verified','manual_review','cancelled','disputed')) OR
  (OLD.status='payment_verified' AND NEW.status IN ('supplier_purchase_pending','manual_review','refunded','disputed')) OR
  (OLD.status='supplier_purchase_pending' AND NEW.status IN ('supplier_pending','delivered','fulfilment_failed','manual_review')) OR
  (OLD.status='supplier_pending' AND NEW.status IN ('delivered','fulfilment_failed','manual_review')) OR
  (OLD.status='fulfilment_failed' AND NEW.status IN ('manual_review','refunded','supplier_purchase_pending')) OR
  (OLD.status='manual_review' AND NEW.status IN ('payment_verified','supplier_purchase_pending','refunded','cancelled','disputed')) OR
  (OLD.status='delivered' AND NEW.status IN ('refunded','disputed')) OR
  (OLD.status='cancelled' AND NEW.status IN ('refunded','manual_review')) OR
  (OLD.status='disputed' AND NEW.status IN ('refunded','manual_review'))
)
BEGIN SELECT RAISE(ABORT,'invalid_order_state_transition'); END;
