PRAGMA foreign_keys = ON;
CREATE TABLE products (supplier_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', cost_usdt TEXT NOT NULL, stock INTEGER, is_unlimited INTEGER NOT NULL DEFAULT 0, duration TEXT, requires_email INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE product_presentation (supplier_id TEXT PRIMARY KEY REFERENCES products(supplier_id), category TEXT, image_url TEXT, featured INTEGER NOT NULL DEFAULT 0);
CREATE TABLE fx_rates (id INTEGER PRIMARY KEY CHECK (id = 1), usdt_inr TEXT NOT NULL, usdt_usd TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, imported INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, error_code TEXT);
CREATE TABLE stock_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id TEXT NOT NULL REFERENCES products(supplier_id), stock INTEGER, is_unlimited INTEGER NOT NULL, observed_at TEXT NOT NULL);
CREATE INDEX products_active_stock ON products(active, stock);
CREATE INDEX stock_snapshots_product_time ON stock_snapshots(supplier_id, observed_at);
CREATE UNIQUE INDEX sync_one_running ON sync_runs(status) WHERE status = 'running';
