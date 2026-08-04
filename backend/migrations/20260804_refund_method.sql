-- Metode refund aktual per retur (cash/qris/transfer/debit).
-- NULL = legacy: distribusi proporsional sesuai metode pembayaran asli.
ALTER TABLE returns ADD COLUMN refund_method VARCHAR(20) DEFAULT NULL AFTER refund_amount;
