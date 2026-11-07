SET @dbname = DATABASE();
SET @tableName = 'stock_transfers';

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = 'cancelled_by') > 0,
  'SELECT 1',
  'ALTER TABLE stock_transfers ADD COLUMN cancelled_by INT DEFAULT NULL AFTER approved_at'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = 'cancelled_at') > 0,
  'SELECT 1',
  'ALTER TABLE stock_transfers ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_by'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = 'cancellation_reason') > 0,
  'SELECT 1',
  'ALTER TABLE stock_transfers ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER cancelled_at'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = @tableName AND CONSTRAINT_NAME = 'fk_stock_transfers_cancelled_by') > 0,
  'SELECT 1',
  'ALTER TABLE stock_transfers ADD CONSTRAINT fk_stock_transfers_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id)'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
