ALTER TABLE expenses ADD COLUMN type ENUM('expense', 'income') DEFAULT 'expense' NOT NULL;
ALTER TABLE expense_categories ADD COLUMN type ENUM('expense', 'income') DEFAULT 'expense' NOT NULL;

INSERT INTO expense_categories (name, account_code, type, description) VALUES
  ('Pendapatan Lain', '4-2000', 'income', 'Pemasukan kas di luar penjualan');

UPDATE expenses SET type = 'expense' WHERE type IS NULL;
UPDATE expense_categories SET type = 'expense' WHERE type IS NULL;
