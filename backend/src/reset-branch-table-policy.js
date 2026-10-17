const HANDLED_BRANCH_TABLES = new Set([
  'transactions', 'stock_mutations', 'stock_opnames', 'stock_transfers',
  'expenses', 'journal_entries', 'purchase_orders', 'cash_drawers',
  'shifts', 'commission_records', 'pending_transactions', 'returns',
]);

const PRESERVED_BRANCH_TABLES = new Set([
  'products', 'warehouses', 'store_settings', 'customers', 'suppliers',
  'periods', 'shift_templates', 'employee_schedules', 'commission_rules',
  'expense_budgets', 'promotions', 'link_page_views', 'link_page_clicks',
  'invoice_sequences', 'users',
]);

function findUnclassifiedBranchTables(entries) {
  return entries.filter(({ table, rows }) => (
    Number(rows) > 0
    && !HANDLED_BRANCH_TABLES.has(table)
    && !PRESERVED_BRANCH_TABLES.has(table)
  ));
}

module.exports = { findUnclassifiedBranchTables };
