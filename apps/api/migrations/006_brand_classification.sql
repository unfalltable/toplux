CREATE TABLE IF NOT EXISTS brand_classifications(
 merchant_id uuid PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
 category_id uuid REFERENCES categories(id),
 suggested_category_id uuid REFERENCES categories(id),
 state text NOT NULL DEFAULT 'UNSET' CHECK(state IN ('UNSET','PENDING','CONFIRMED')),
 source text NOT NULL DEFAULT 'EMPTY',
 version int NOT NULL DEFAULT 1,
 suggested_at timestamptz,
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 reason text NOT NULL DEFAULT '',
 CHECK((state='CONFIRMED' AND category_id IS NOT NULL) OR (state<>'CONFIRMED' AND category_id IS NULL)),
 CHECK(state<>'PENDING' OR suggested_category_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS brand_category_reports(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES merchants(id),
 visitor_key text NOT NULL,suggested_category_id uuid NOT NULL REFERENCES categories(id),
 reason text NOT NULL,state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED')),
 resolution text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS brand_category_open_report ON brand_category_reports(merchant_id,visitor_key) WHERE state='OPEN';
CREATE INDEX IF NOT EXISTS category_report_visitor ON brand_category_reports(visitor_key,created_at);
CREATE TABLE IF NOT EXISTS brand_category_history(
 id uuid PRIMARY KEY,merchant_id uuid NOT NULL REFERENCES merchants(id),actor_id uuid NOT NULL REFERENCES users(id),
 before_category_id uuid REFERENCES categories(id),after_category_id uuid NOT NULL REFERENCES categories(id),
 before_state text NOT NULL,reason text NOT NULL,version int NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
