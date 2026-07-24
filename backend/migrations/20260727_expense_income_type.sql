SET @dbname = DATABASE();

-- Add type column to expenses if not exists
SET @tableName = 'expenses';
SET @columnName = 'type';
SET @addExpenses = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE expenses ADD COLUMN type ENUM('expense', 'income') DEFAULT 'expense' NOT NULL"
));
PREPARE stmt FROM @addExpenses;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add type column to expense_categories if not exists
SET @tableName = 'expense_categories';
SET @columnName = 'type';
SET @addCategories = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE expense_categories ADD COLUMN type ENUM('expense', 'income') DEFAULT 'expense' NOT NULL"
));
PREPARE stmt FROM @addCategories;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add default income category if not exists
INSERT INTO expense_categories (name, account_code, type, description)
SELECT 'Pendapatan Lain', '4-2000', 'income', 'Pemasukan kas di luar penjualan'
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE account_code = '4-2000' AND type = 'income');

-- Ensure existing rows have type
UPDATE expenses SET type = 'expense' WHERE type IS NULL;
UPDATE expense_categories SET type = 'expense' WHERE type IS NULL;
