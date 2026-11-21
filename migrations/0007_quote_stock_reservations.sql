CREATE TABLE quote_stock_reservations (
  order_line_id TEXT PRIMARY KEY REFERENCES order_lines(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  supplier_id TEXT NOT NULL REFERENCES products(supplier_id),
  variant_id TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  expires_at TEXT NOT NULL
);
CREATE INDEX quote_stock_reservations_active ON quote_stock_reservations(supplier_id,variant_id,expires_at);

CREATE TRIGGER reserve_base_quote_stock
BEFORE INSERT ON quote_stock_reservations
WHEN NEW.variant_id = '' AND EXISTS (
  SELECT 1 FROM products p
  WHERE p.supplier_id=NEW.supplier_id AND p.active=1 AND p.is_unlimited=0 AND p.stock IS NOT NULL
    AND COALESCE((SELECT SUM(r.quantity) FROM quote_stock_reservations r
      WHERE r.supplier_id=NEW.supplier_id AND r.variant_id='' AND r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0)+NEW.quantity>p.stock
)
BEGIN SELECT RAISE(ABORT,'quote_stock_unavailable'); END;

CREATE TRIGGER reserve_variant_quote_stock
BEFORE INSERT ON quote_stock_reservations
WHEN NEW.variant_id <> '' AND EXISTS (
  SELECT 1 FROM products p
  WHERE p.supplier_id=NEW.supplier_id AND p.active=1
    AND COALESCE((SELECT json_extract(v.value,'$.unlimited') FROM json_each(p.variants_json) v
      WHERE json_extract(v.value,'$.id')=NEW.variant_id LIMIT 1),0)<>1
    AND COALESCE((SELECT SUM(r.quantity) FROM quote_stock_reservations r
      WHERE r.supplier_id=NEW.supplier_id AND r.variant_id=NEW.variant_id AND r.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')),0)+NEW.quantity>
      COALESCE((SELECT CAST(json_extract(v.value,'$.stock') AS INTEGER) FROM json_each(p.variants_json) v
        WHERE json_extract(v.value,'$.id')=NEW.variant_id LIMIT 1),-1)
)
BEGIN SELECT RAISE(ABORT,'quote_stock_unavailable'); END;

CREATE TRIGGER release_cancelled_quote_stock
AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled'
BEGIN DELETE FROM quote_stock_reservations WHERE order_id=NEW.id; END;
