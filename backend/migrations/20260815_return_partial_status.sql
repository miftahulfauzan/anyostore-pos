-- Retur sebagian: status transaksi khusus + penanda qty retur per item.
ALTER TABLE transactions MODIFY COLUMN status ENUM('completed','cancelled','refunded','pending','held','partially_cancelled','partially_refunded') NOT NULL DEFAULT 'completed';
ALTER TABLE transaction_items ADD COLUMN returned_qty INT NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN refunded_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
