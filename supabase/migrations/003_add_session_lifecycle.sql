-- Type: Additive
-- Notes: never applied to the live DB; reconciled idempotently by 00010.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at) WHERE status = 'running';
