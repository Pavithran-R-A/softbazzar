CREATE TABLE fx_rate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usdt_inr TEXT,
  usdt_usd TEXT,
  source_url TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed')),
  error_code TEXT
);
CREATE INDEX fx_rate_history_recent ON fx_rate_history(id DESC);
CREATE TRIGGER fx_rate_history_no_update BEFORE UPDATE ON fx_rate_history BEGIN SELECT RAISE(ABORT,'fx_history_immutable'); END;
CREATE TRIGGER fx_rate_history_no_delete BEFORE DELETE ON fx_rate_history BEGIN SELECT RAISE(ABORT,'fx_history_immutable'); END;
