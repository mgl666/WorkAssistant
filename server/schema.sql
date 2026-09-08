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
  table_name text NOT NULL CHECK (table_name IN ('events','todos','lists','notes','sessions','daily_tasks','goals','work_logs')),
  record_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  revision bigserial NOT NULL,
  PRIMARY KEY (user_id, table_name, record_id)
);
CREATE INDEX IF NOT EXISTS app_records_user_revision_idx ON app_records(user_id, revision);

-- 为已经部署过旧版本的数据库扩展同步集合；新安装和升级均可重复执行。
ALTER TABLE app_records DROP CONSTRAINT IF EXISTS app_records_table_name_check;
ALTER TABLE app_records ADD CONSTRAINT app_records_table_name_check
  CHECK (table_name IN ('events','todos','lists','notes','sessions','daily_tasks','goals','work_logs'));
