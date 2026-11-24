-- Bukti transfer pesanan reseller.
--
-- Sebelumnya pembeli hanya diminta "kirim bukti transfer ke WhatsApp admin",
-- jadi bukti bayar berada di luar sistem dan admin harus mencocokkan manual.
-- Kolom ini menyimpan path media (media-storage) agar bukti bisa dilihat di
-- halaman status pembeli maupun detail pesanan admin.
--
-- Dijaga kondisional (cek INFORMATION_SCHEMA) agar aman pada DB yang sudah
-- dimigrasi maupun volume baru dari schema.sql.
SET @dbname = DATABASE();
SET @tableName = 'reseller_orders';

SET @columnName = 'payment_proof_path';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE reseller_orders ADD COLUMN payment_proof_path VARCHAR(255) NULL AFTER payment_status"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @columnName = 'payment_proof_uploaded_at';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE reseller_orders ADD COLUMN payment_proof_uploaded_at TIMESTAMP NULL DEFAULT NULL AFTER payment_proof_path"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;