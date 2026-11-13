CREATE TABLE merchant_pricing_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  usd_inr TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
INSERT INTO merchant_pricing_settings(id,usd_inr,updated_at,updated_by)
VALUES(1,'105',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration-0008');

CREATE TABLE merchant_pricing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  previous_usd_inr TEXT,
  usd_inr TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
INSERT INTO merchant_pricing_audit(previous_usd_inr,usd_inr,reason,changed_by,changed_at)
VALUES(NULL,'105','Initial fixed merchant conversion policy','migration-0008',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

ALTER TABLE orders ADD COLUMN merchant_usd_inr TEXT;
ALTER TABLE pricing_snapshots ADD COLUMN merchant_usd_inr TEXT NOT NULL DEFAULT '105';

CREATE TRIGGER orders_merchant_rate_lock
BEFORE UPDATE OF merchant_usd_inr ON orders
WHEN OLD.merchant_usd_inr IS NOT NEW.merchant_usd_inr
BEGIN SELECT RAISE(ABORT,'order_merchant_rate_is_immutable'); END;

CREATE TRIGGER merchant_pricing_audit_no_update
BEFORE UPDATE ON merchant_pricing_audit
BEGIN SELECT RAISE(ABORT,'merchant_pricing_audit_is_immutable'); END;
CREATE TRIGGER merchant_pricing_audit_no_delete
BEFORE DELETE ON merchant_pricing_audit
BEGIN SELECT RAISE(ABORT,'merchant_pricing_audit_is_immutable'); END;
