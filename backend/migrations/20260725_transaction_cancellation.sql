-- Partial transaction cancellation support
ALTER TABLE transaction_items
  ADD COLUMN cancelled_qty INT NOT NULL DEFAULT 0 AFTER quantity,
  ADD COLUMN cancel_reason VARCHAR(255) NULL AFTER cancelled_qty;

ALTER TABLE transactions
  ADD COLUMN cancelled_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `change`,
  ADD COLUMN cancel_reason TEXT NULL AFTER cancelled_amount;
