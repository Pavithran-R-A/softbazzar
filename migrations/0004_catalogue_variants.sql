ALTER TABLE products ADD COLUMN variants_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE order_lines ADD COLUMN supplier_variant_id TEXT;
CREATE INDEX sync_runs_recent ON sync_runs(id DESC, status);
