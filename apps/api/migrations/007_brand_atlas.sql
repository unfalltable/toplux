ALTER TABLE profiles ADD COLUMN IF NOT EXISTS editorial jsonb NOT NULL DEFAULT '{}'::jsonb;
