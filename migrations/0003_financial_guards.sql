ALTER TABLE orders ADD COLUMN request_hash TEXT;

CREATE TRIGGER orders_amount_lock
BEFORE UPDATE OF idempotency_key,request_hash,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at ON orders
WHEN OLD.idempotency_key != NEW.idempotency_key
  OR OLD.request_hash IS NOT NEW.request_hash
  OR OLD.customer_email IS NOT NEW.customer_email
  OR OLD.currency != NEW.currency
  OR OLD.total_paise != NEW.total_paise
  OR OLD.fx_usdt_inr != NEW.fx_usdt_inr
  OR OLD.fx_usdt_usd != NEW.fx_usdt_usd
  OR OLD.quote_expires_at != NEW.quote_expires_at
BEGIN
  SELECT RAISE(ABORT,'order_quote_is_immutable');
END;

CREATE TRIGGER payment_verified_requires_bank_evidence
BEFORE UPDATE OF status ON orders
WHEN NEW.status = 'payment_verified'
 AND NOT EXISTS (
   SELECT 1 FROM payment_attempts pa
   JOIN payment_evidence pe ON pe.payment_attempt_id = pa.id
   WHERE pa.order_id = OLD.id
     AND pe.verification_source = 'official_bank_record_admin_decision'
     AND pe.bank_reference_hash IS NOT NULL
     AND NEW.verification_decision_id IS NOT NULL
 )
BEGIN
  SELECT RAISE(ABORT,'verified_payment_requires_admin_bank_evidence');
END;

CREATE TRIGGER fulfilment_requires_verified_purchase
BEFORE INSERT ON supplier_fulfilments
WHEN NOT EXISTS (
  SELECT 1 FROM order_lines ol
  JOIN orders o ON o.id = ol.order_id
  WHERE ol.id = NEW.order_line_id
    AND o.status IN ('supplier_purchase_pending','supplier_pending')
)
BEGIN
  SELECT RAISE(ABORT,'supplier_fulfilment_requires_verified_payment');
END;

CREATE TRIGGER payment_evidence_no_update
BEFORE UPDATE ON payment_evidence
BEGIN
  SELECT RAISE(ABORT,'payment_evidence_is_immutable');
END;

CREATE TRIGGER payment_evidence_no_delete
BEFORE DELETE ON payment_evidence
BEGIN
  SELECT RAISE(ABORT,'payment_evidence_is_immutable');
END;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT,'audit_events_are_immutable');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT,'audit_events_are_immutable');
END;

CREATE TRIGGER admin_actions_no_update
BEFORE UPDATE ON admin_actions
BEGIN
  SELECT RAISE(ABORT,'admin_actions_are_immutable');
END;

CREATE TRIGGER admin_actions_no_delete
BEFORE DELETE ON admin_actions
BEGIN
  SELECT RAISE(ABORT,'admin_actions_are_immutable');
END;

CREATE TRIGGER order_lines_no_update
BEFORE UPDATE ON order_lines
BEGIN
  SELECT RAISE(ABORT,'order_lines_are_immutable');
END;

CREATE TRIGGER order_lines_no_delete
BEFORE DELETE ON order_lines
BEGIN
  SELECT RAISE(ABORT,'order_lines_are_immutable');
END;

CREATE TRIGGER pricing_snapshots_no_update
BEFORE UPDATE ON pricing_snapshots
BEGIN
  SELECT RAISE(ABORT,'pricing_snapshots_are_immutable');
END;

CREATE TRIGGER pricing_snapshots_no_delete
BEFORE DELETE ON pricing_snapshots
BEGIN
  SELECT RAISE(ABORT,'pricing_snapshots_are_immutable');
END;
