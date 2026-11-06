const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

test('reports overview exposes separate sales, income, returns and product groups', async () => {
  const dbPath = require.resolve('../src/db');
  const calls = [];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT name FROM branches')) return [[{ name: 'Semua Toko/Gudang' }]];
        if (sql.includes('AS return_amount') && sql.includes('COUNT(*)')) {
          return [[{ return_count: '1', return_amount: '12000' }]];
        }
        if (sql.includes('FROM returns') && sql.includes('GROUP BY DATE')) {
          return [[{ date: '2026-11-01', count: '1', amount: '12000' }]];
        }
        if (sql.includes("type = 'income'") && sql.includes('GROUP BY expense_date')) {
          return [[{ date: '2026-11-01', amount: '30000' }]];
        }
        if (sql.includes("type = 'expense'") && sql.includes('GROUP BY expense_date')) {
          return [[{ date: '2026-11-01', amount: '20000' }]];
        }
        if (sql.includes('AS new_customers')) return [[{ new_customers: '1' }]];
        if (sql.includes('GROUP BY category_name')) {
          return [[{ category_name: 'Denim', quantity_sold: '5', revenue: '100000' }]];
        }
        if (sql.includes('COUNT(*) AS transactions') && sql.includes('AS revenue')) {
          return [[{ transactions: '2', revenue: '100000', discounts: '5000' }]];
        }
        if (sql.includes('AS cost_of_goods')) {
          return [[{ cost_of_goods: '40000', item_profit: '60000' }]];
        }
        if (sql.includes('AS amount') && sql.includes('AS income') && sql.includes('FROM expenses')) {
          return [[{ amount: '20000', income: '30000' }]];
        }
        if (sql.includes('tp.payment_method')) return [[{ payment_method: 'cash', transactions: '2', amount: '100000' }]];
        if (sql.includes('GROUP BY ti.product_id')) {
          return [[{ product_id: 10, name: 'Denim', sku: 'D10', category_name: 'Denim', quantity_sold: '5', revenue: '100000', cost_of_goods: '40000', profit: '60000' }]];
        }
        if (sql.includes('FROM users u')) return [[]];
        if (sql.includes('FROM customers c')) return [[]];
        if (sql.includes('p.min_stock')) return [[]];
        if (sql.includes('GROUP BY transaction_date')) {
          return [[{ date: '2026-11-01', transactions: '2', revenue: '100000' }]];
        }
        if (sql.includes('t.price_tier')) return [[]];
        if (sql.includes('t.invoice_no')) return [[]];
        return [[]];
      },
    },
  };

  const router = require('../src/routes/reports');
  const handler = router.stack.find((layer) => layer.route?.path === '/overview').route.stack.at(-1).handle;
  let body;
  await handler(
    { user: { role: 'owner', branch_id: 4 }, query: { branch_id: 'all', start: '2026-11-01', end: '2026-11-03' } },
    { json(value) { body = value; } },
    (error) => { throw error; },
  );

  assert.equal(body.data.summary.gross_sales, 100000);
  assert.equal(body.data.summary.income, 30000);
  assert.equal(body.data.summary.revenue, 100000);
  assert.equal(body.data.summary.return_amount, 12000);
  assert.equal(body.data.summary.return_count, 1);
  assert.equal(body.data.summary.new_customers, 1);
  assert.equal(body.data.summary.average_transaction, 50000);
  assert.deepEqual(body.data.daily_income, [
    { date: '2026-11-01', amount: 30000 },
    { date: '2026-11-02', amount: 0 },
    { date: '2026-11-03', amount: 0 },
  ]);
  assert.deepEqual(body.data.daily_expenses, [
    { date: '2026-11-01', amount: 20000 },
    { date: '2026-11-02', amount: 0 },
    { date: '2026-11-03', amount: 0 },
  ]);
  assert.deepEqual(body.data.daily_returns, [
    { date: '2026-11-01', count: 1, amount: 12000 },
    { date: '2026-11-02', count: 0, amount: 0 },
    { date: '2026-11-03', count: 0, amount: 0 },
  ]);
  assert.deepEqual(body.data.product_groups, [
    { name: 'Denim', quantity_sold: 5, revenue: 100000 },
  ]);
  assert.deepEqual(body.data.sales_sources, [
    { name: 'POS', transactions: 2, revenue: 100000, share: 100 },
  ]);
  assert.equal(body.data.branch_id, 'all');
  assert.ok(calls.some(({ sql, params }) => sql.includes('branch_id') && params.includes('2026-11-01')));
});
