-- Nullable for pre-migration tokens, assigned on their first successful refresh.
-- A family survives rotation and is revoked as a whole on logout.
ALTER TABLE refresh_tokens
  ADD COLUMN session_id CHAR(36) NULL,
  ADD INDEX idx_refresh_session (user_id, session_id, revoked_at, expires_at);
