-- Nomor batch/nota untuk Produk Masuk/Keluar (misal BATCH-20260803-001).
SET @dbname = DATABASE();
SET @tableName = 'stock_mutations';
SET @columnName = 'batch_number';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE stock_mutations ADD COLUMN batch_number VARCHAR(50) DEFAULT NULL COMMENT 'Nomor batch/nota stock masuk/keluar' AFTER reference_id"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
