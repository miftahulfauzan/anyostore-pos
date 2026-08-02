-- Add type to branches so Gudang Pusat (stock-only) is distinguished from Toko.
SET @dbname = DATABASE();
SET @tableName = 'branches';
SET @columnName = 'type';
SET @addType = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE branches ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'toko' COMMENT 'toko, gudang' AFTER is_active"
));
PREPARE stmt FROM @addType;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE branches SET type = 'toko' WHERE type = '' OR type IS NULL;
