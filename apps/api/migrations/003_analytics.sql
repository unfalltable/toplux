CREATE TABLE IF NOT EXISTS analytics_events(
 id uuid PRIMARY KEY,
 event_key uuid NOT NULL UNIQUE,
 merchant_id uuid NOT NULL REFERENCES merchants(id),
 link_id uuid REFERENCES links(id),
 kind text NOT NULL CHECK(kind IN ('IMPRESSION','VIEW','WEBSITE','STORE','LIVE','VIDEO')),
 visitor_key text NOT NULL,
 source text NOT NULL CHECK(source IN ('total','category','detail','direct')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_merchant_date ON analytics_events(merchant_id,created_at);
CREATE INDEX IF NOT EXISTS analytics_visitor_date ON analytics_events(visitor_key,created_at);
