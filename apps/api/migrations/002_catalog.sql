
CREATE TABLE IF NOT EXISTS profile_revisions(
 id uuid PRIMARY KEY,
 profile_id uuid NOT NULL REFERENCES profiles(id),
 payload jsonb NOT NULL,
 base_version integer NOT NULL,
 author_id uuid NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'DRAFT',
 reviewer_id uuid REFERENCES users(id),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revision_profile_state ON profile_revisions(profile_id,state);
