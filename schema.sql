-- =============================================================
-- INE Price Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- =============================================================

-- 1. Tracked products (products the user chose to monitor)
CREATE TABLE IF NOT EXISTS tracked_products (
  id            BIGSERIAL PRIMARY KEY,
  product_id    INTEGER   NOT NULL UNIQUE,    -- ID from the mock store
  slug          TEXT      NOT NULL,
  name          TEXT      NOT NULL,
  brand         TEXT,
  category      TEXT,
  sku           TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Price/stock history (one row per successful scrape)
CREATE TABLE IF NOT EXISTS price_history (
  id            BIGSERIAL PRIMARY KEY,
  product_id    INTEGER   NOT NULL REFERENCES tracked_products(product_id) ON DELETE CASCADE,
  price         NUMERIC(10, 2),
  mrp           NUMERIC(10, 2),
  sale_price    NUMERIC(10, 2),
  discount_pct  NUMERIC(5, 2),
  stock         INTEGER,
  currency      TEXT      DEFAULT 'INR',
  rating        NUMERIC(3, 1),
  rating_count  INTEGER,
  seller        TEXT,
  delivery_days INTEGER,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by product and time
CREATE INDEX IF NOT EXISTS idx_price_history_product_time
  ON price_history (product_id, scraped_at DESC);

-- 3. Scrape logs (every attempt, including failures)
CREATE TABLE IF NOT EXISTS scrape_logs (
  id            BIGSERIAL PRIMARY KEY,
  product_id    INTEGER   NOT NULL REFERENCES tracked_products(product_id) ON DELETE CASCADE,
  status        TEXT      NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
  attempts      INTEGER   NOT NULL DEFAULT 1,
  error_message TEXT,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time
  ON scrape_logs (product_id, created_at DESC);

-- 4. Enable Row Level Security but allow all operations with anon key
--    (suitable for a demo/assignment project)
ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on tracked_products" ON tracked_products;
CREATE POLICY "Allow all on tracked_products" ON tracked_products
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on price_history" ON price_history;
CREATE POLICY "Allow all on price_history" ON price_history
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scrape_logs" ON scrape_logs;
CREATE POLICY "Allow all on scrape_logs" ON scrape_logs
  FOR ALL USING (true) WITH CHECK (true);
