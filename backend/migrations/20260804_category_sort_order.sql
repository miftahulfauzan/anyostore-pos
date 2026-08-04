-- Urutan kategori untuk drag-and-drop (dipakai landing page & pengaturan).
SET @dbname = DATABASE();
SET @tableName = 'categories';
SET @columnName = 'sort_order';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER description"
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
UPDATE categories SET sort_order = id WHERE sort_order = 0;
