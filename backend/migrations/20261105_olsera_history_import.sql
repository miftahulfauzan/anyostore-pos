ALTER TABLE transactions
  MODIFY COLUMN payment_method ENUM('cash','qris','debit','transfer','credit','split','other') NOT NULL,
  ADD COLUMN source_system VARCHAR(20) NULL AFTER price_tier,
  ADD COLUMN source_order_no VARCHAR(100) NULL AFTER source_system,
  ADD COLUMN source_cashier VARCHAR(100) NULL AFTER source_order_no,
  ADD COLUMN source_customer_name VARCHAR(100) NULL AFTER source_cashier,
  ADD COLUMN source_order_source VARCHAR(50) NULL AFTER source_customer_name,
  ADD UNIQUE KEY uq_transactions_source_order (branch_id, source_system, source_order_no);

ALTER TABLE transaction_items
  MODIFY COLUMN product_id INT NULL;

ALTER TABLE transaction_payments
  MODIFY COLUMN payment_method ENUM('cash','qris','debit','transfer','credit','other') NOT NULL;
