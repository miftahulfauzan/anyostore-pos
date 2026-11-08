-- Idempotency key for automatic and manual mobile drafts.
ALTER TABLE pending_transactions
  ADD COLUMN client_hold_id VARCHAR(128) NULL;

CREATE UNIQUE INDEX uq_pending_transactions_client_hold_id
  ON pending_transactions (client_hold_id);
