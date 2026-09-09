-- Version zero allows unchanged users to upgrade a valid legacy refresh once.
-- Password/PIN, role and active-state changes increment this value atomically.
ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
