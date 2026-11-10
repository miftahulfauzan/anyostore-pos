-- Reservasi nomor invoice: dipakai tombol "Bagikan" di POS agar invoice yang
-- dikirim ke pembeli (sebelum pembayaran) sudah bernomor resmi dan nomor itu
-- tetap sama ketika transaksi diselesaikan.
CREATE TABLE IF NOT EXISTS invoice_reservations (
  client_transaction_id VARCHAR(64) PRIMARY KEY,
  branch_id INT NOT NULL,
  invoice_no VARCHAR(64) NOT NULL,
  user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  UNIQUE KEY uniq_invoice_reservations_no (invoice_no),
  KEY idx_invoice_reservations_branch (branch_id, created_at)
);
