-- Speed up expected-cash calculations for open drawers, which scan approved
-- cash expenses created since the drawer was opened.
ALTER TABLE expenses
  ADD INDEX idx_expenses_cash_drawer (branch_id, status, payment_method, created_at);
