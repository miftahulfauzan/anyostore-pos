-- Indeks rentang tanggal untuk ringkasan Dashboard pada satu cabang maupun semua cabang.
ALTER TABLE transactions
  ADD INDEX idx_transactions_date_status (transaction_date, status);

ALTER TABLE expenses
  ADD INDEX idx_expenses_branch_date (branch_id, expense_date),
  ADD INDEX idx_expenses_expense_date (expense_date);
