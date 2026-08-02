-- Add type to warehouses so reject/return stock can be stored separately.
SET @dbname = DATABASE();
SET @tableName = 'warehouses';
SET @columnName = 'type';
SET @addType = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE warehouses ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'utama' COMMENT 'utama, cadangan, reject' AFTER name"
));
PREPARE stmt FROM @addType;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE warehouses SET type = 'utama' WHERE type = '' OR type IS NULL;
