-- Retur sebagian: status transaksi khusus + penanda qty retur per item.
ALTER TABLE transactions MODIFY COLUMN status ENUM('completed','cancelled','refunded','pending','held','partially_cancelled','partially_refunded') NOT NULL DEFAULT 'completed';
ALTER TABLE transaction_items ADD COLUMN returned_qty INT NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN refunded_amount DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill: isi refunded_amount dari retur yang sudah disetujui (data lama).
UPDATE transactions t
SET t.refunded_amount = COALESCE(
  (SELECT SUM(r.refund_amount) FROM returns r
    WHERE r.transaction_id = t.id AND r.status = 'approved'), 0);
