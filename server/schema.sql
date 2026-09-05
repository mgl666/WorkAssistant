CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_records (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  table_name text NOT NULL CHECK (table_name IN ('events','todos','lists','notes','sessions','daily_tasks')),
  record_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  revision bigserial NOT NULL,
  PRIMARY KEY (user_id, table_name, record_id)
);
CREATE INDEX IF NOT EXISTS app_records_user_revision_idx ON app_records(user_id, revision);
