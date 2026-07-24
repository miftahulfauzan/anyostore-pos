ALTER TABLE expenses ADD COLUMN type ENUM('expense', 'income') DEFAULT 'expense' NOT NULL;

INSERT INTO expense_categories (name, account_code, description) VALUES
  ('Pendapatan Lain', '4-2000', 'Pemasukan kas di luar penjualan');

UPDATE expenses SET type = 'expense' WHERE type IS NULL;
