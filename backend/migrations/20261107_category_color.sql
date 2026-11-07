-- Warna visual kategori yang dipakai aplikasi POS.
SET @dbname = DATABASE();
SET @tableName = 'categories';
SET @columnName = 'color';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE categories ADD COLUMN color VARCHAR(7) NULL AFTER sort_order"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
