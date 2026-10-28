CREATE TABLE IF NOT EXISTS ranking_lock(id int PRIMARY KEY CHECK(id=1));
INSERT INTO ranking_lock VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ranking_heads(
 scope text PRIMARY KEY,
 merchant_id uuid REFERENCES merchants(id) ON DELETE SET NULL,
 since timestamptz,
 tracked_from timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS ranking_payments(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
 merchant_id uuid NOT NULL REFERENCES merchants(id),
 category_id uuid NOT NULL REFERENCES categories(id),
 amount_fen bigint NOT NULL CHECK(amount_fen>0),
 combo int NOT NULL CHECK(combo>0),
 paid_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ranking_payment_brand ON ranking_payments(merchant_id,seq DESC);
