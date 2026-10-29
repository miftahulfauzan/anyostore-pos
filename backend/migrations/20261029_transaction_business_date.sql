ALTER TABLE transactions ADD COLUMN transaction_date DATE NULL AFTER branch_id;

UPDATE transactions
SET transaction_date = DATE(created_at)
WHERE transaction_date IS NULL;

ALTER TABLE transactions MODIFY transaction_date DATE NOT NULL;

CREATE INDEX idx_transactions_branch_transaction_date
  ON transactions (branch_id, transaction_date, created_at);
