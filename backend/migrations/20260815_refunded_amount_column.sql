-- Kolom refunded_amount di transactions + backfill data retur lama.
-- (File BARU: versi awal migrasi status retur sudah terlanjur terpasang di
-- produksi sebelum kolom ini ditambahkan, jadi harus file terpisah.)
ALTER TABLE transactions ADD COLUMN refunded_amount DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill: isi refunded_amount dari retur yang sudah disetujui (data lama).
UPDATE transactions t
SET t.refunded_amount = COALESCE(
  (SELECT SUM(r.refund_amount) FROM returns r
    WHERE r.transaction_id = t.id AND r.status = 'approved'), 0);
