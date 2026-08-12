ALTER TABLE transactions ADD COLUMN offline_invoice_no VARCHAR(50) NULL AFTER invoice_no;
CREATE INDEX idx_transactions_offline_invoice ON transactions(offline_invoice_no);
