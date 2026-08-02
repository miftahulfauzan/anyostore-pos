-- Fix transactions.status ENUM: add 'partially_cancelled' (set by cancel endpoint).
-- Re-running the same definition is a no-op, so this is idempotent.
ALTER TABLE transactions
  MODIFY status ENUM('completed','cancelled','refunded','pending','held','partially_cancelled')
  DEFAULT 'completed';

-- Add received_at to purchase_orders (used by PPN Masukan tax report).
SET @dbname = DATABASE();
SET @tableName = 'purchase_orders';
SET @columnName = 'received_at';
SET @addReceivedAt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE purchase_orders ADD COLUMN received_at DATETIME DEFAULT NULL COMMENT 'Waktu barang diterima (penerimaan PO)' AFTER approved_by"
));
PREPARE stmt FROM @addReceivedAt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
