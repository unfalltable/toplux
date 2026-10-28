CREATE TABLE IF NOT EXISTS partner_listings (
 id uuid PRIMARY KEY, owner_key text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','HIDDEN')),
 payload jsonb NOT NULL, request_key uuid NOT NULL, body_hash text NOT NULL, UNIQUE(owner_key,request_key), verification text NOT NULL DEFAULT 'INDEPENDENT' CHECK(verification IN ('INDEPENDENT','OFFICIAL','AUTHORIZED')),
 verification_reason text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 review_reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partner_revisions (
 id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES partner_listings(id), payload jsonb NOT NULL,
 base_version integer NOT NULL, state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partner_campaigns (
 id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES partner_listings(id), owner_key text NOT NULL,
 brand_id uuid NOT NULL REFERENCES merchants(id), city text NOT NULL,
 bid_fen integer NOT NULL CHECK(bid_fen BETWEEN 1 AND 10000),
 budget_fen integer NOT NULL CHECK(budget_fen BETWEEN 1 AND 10000000),
 spent_fen integer NOT NULL DEFAULT 0 CHECK(spent_fen>=0 AND spent_fen<=budget_fen),
 state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','PAUSED')),
 mode text NOT NULL DEFAULT 'SANDBOX' CHECK(mode='SANDBOX'),
 ends_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL, body_hash text NOT NULL, UNIQUE(owner_key,request_key), CHECK(budget_fen>=bid_fen)
);
CREATE TABLE IF NOT EXISTS partner_events (
 id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES partner_listings(id), visitor_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('IMPRESSION','VIEW','PHONE','WECHAT','MAP','APPOINTMENT')),
 campaign_id uuid REFERENCES partner_campaigns(id), event_key uuid NOT NULL, body_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(visitor_key,event_key)
);
CREATE TABLE IF NOT EXISTS partner_spend (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES partner_campaigns(id),
 event_id uuid NOT NULL UNIQUE REFERENCES partner_events(id), visitor_key text NOT NULL,
 billing_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date, amount_fen integer NOT NULL CHECK(amount_fen>0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,visitor_key,billing_day)
);
CREATE TABLE IF NOT EXISTS partner_appointments (
 id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES partner_listings(id), visitor_key text NOT NULL,
 event_key uuid NOT NULL, body_hash text NOT NULL, name text NOT NULL, phone text NOT NULL,
 preferred_at timestamptz NOT NULL, note text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'NEW' CHECK(state IN ('NEW','CONTACTED','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(visitor_key,event_key)
);
CREATE INDEX IF NOT EXISTS partner_owner ON partner_listings(owner_key);
CREATE INDEX IF NOT EXISTS partner_campaign_scope ON partner_campaigns(brand_id,city,state);
CREATE INDEX IF NOT EXISTS partner_event_listing ON partner_events(listing_id,created_at);
CREATE OR REPLACE FUNCTION immutable_partner_spend() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '推广消耗流水不可修改'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_spend_immutable ON partner_spend;
CREATE TRIGGER partner_spend_immutable BEFORE UPDATE OR DELETE ON partner_spend FOR EACH ROW EXECUTE FUNCTION immutable_partner_spend();
