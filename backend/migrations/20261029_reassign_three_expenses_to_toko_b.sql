-- Restore the three owner-entered expenses to the selected Toko B branch.
-- Exact source branch, IDs, categories, descriptions, amounts, and statuses
-- guard against reassigning unrelated financial records.
UPDATE expenses AS e
JOIN branches AS source_branch
  ON source_branch.id = e.branch_id
  AND source_branch.id = 1
  AND source_branch.name = 'Anyostore Metro'
JOIN branches AS target_branch
  ON target_branch.id = 2
  AND target_branch.name = 'Toko B'
  AND target_branch.is_active = TRUE
JOIN expense_categories AS c ON c.id = e.category_id
SET e.branch_id = target_branch.id
WHERE e.type = 'expense'
  AND e.status = 'approved'
  AND (
    (e.id = 6 AND c.name = 'Operasional' AND e.name = 'Minum' AND e.amount = 40000)
    OR (e.id = 7 AND c.name = 'Bang Richard' AND e.name = 'porter' AND e.amount = 15000)
    OR (e.id = 8 AND c.name = 'Listrik' AND e.name = 'lampu' AND e.amount = 300000)
  );
