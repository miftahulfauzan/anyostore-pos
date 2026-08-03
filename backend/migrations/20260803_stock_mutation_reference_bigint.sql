-- reference_id used to store Date.now() batch ids for mutation reports.
-- INT (max ~2.1B) overflows on 13-digit timestamps; widen to BIGINT.
SET @dbname = DATABASE();
SET @tableName = 'stock_mutations';
SET @columnName = 'reference_id';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName AND DATA_TYPE = 'bigint') > 0,
  'SELECT 1',
  "ALTER TABLE stock_mutations MODIFY COLUMN reference_id BIGINT DEFAULT NULL"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
