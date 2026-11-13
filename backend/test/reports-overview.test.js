const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

test('reports overview exposes sales, profit, products and return sections', async () => {
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
        if (sql.includes('AS transaction_discount')) {
          return [[{ transaction_discount: '5000', item_discount: '0' }]];
        }
        if (sql.includes('COUNT(*) AS transactions') && sql.includes('AS revenue')) {
          return [[{ transactions: '2', revenue: '100000', discounts: '5000' }]];
        }
        if (sql.includes('item_profit')) {
          return [[{ cost_of_goods: '40000', item_profit: '60000' }]];
        }
        if (sql.includes('AS amount') && sql.includes('AS income') && sql.includes('FROM expenses')) {
          return [[{ amount: '20000', income: '30000' }]];
        }
        if (sql.includes('COUNT(*) AS transactions') && sql.includes('cancelled_amount')) {
          return [[{ transactions: '0', amount: '0' }]];
        }
        if (sql.includes('tp.payment_method')) return [[{ payment_method: 'cash', transactions: '2', amount: '100000' }]];
        if (sql.includes('GROUP BY ti.product_id')) {
          return [[{ product_id: 10, name: 'Denim', sku: 'D10', category_name: 'Denim', quantity_sold: '5', revenue: '100000', cost_of_goods: '40000', profit: '60000' }]];
        }
        if (sql.includes('GROUP BY c.id, c.name')) {
          return [[{ category_id: 1, category_name: 'Denim', quantity_sold: '5', revenue: '100000', cost_of_goods: '40000', profit: '60000' }]];
        }
        if (sql.includes('t.invoice_no')) return [[]];
        if (sql.includes('FROM users u')) return [[]];
        if (sql.includes('FROM customers c')) return [[]];
        if (sql.includes('p.min_stock')) return [[]];
        if (sql.includes('GROUP BY transaction_date')) {
          return [[{ date: '2026-11-01', transactions: '2', revenue: '100000' }]];
        }
        if (sql.includes('t.price_tier')) return [[]];
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
  assert.equal(body.data.summary.revenue, 130000);
  assert.equal(body.data.summary.profit_margin_percent, 90);
  assert.equal(body.data.summary.transaction_discounts, 5000);
  assert.equal(body.data.summary.refund_amount, 0);
  assert.equal(body.data.summary.products_sold, 0);
  assert.ok(body.data.previous_summary);
  assert.equal(body.data.comparison_period.start, '2026-10-29');
  assert.equal(body.data.comparison_period.end, '2026-10-31');
  assert.ok(Array.isArray(body.data.daily_expenses));
  assert.ok(Array.isArray(body.data.daily_income));
  assert.ok(Array.isArray(body.data.daily_returns));
  assert.ok(Array.isArray(body.data.sales_sources));
  assert.equal(body.data.products[0].name, 'Denim');
  assert.equal(body.data.categories[0].category_name, 'Denim');
  assert.equal(body.data.payment_methods[0].payment_method, 'cash');
  assert.equal(body.data.branch_id, 'all');
  assert.ok(calls.some(({ sql, params }) => sql.includes('branch_id') && params.includes('2026-11-01')));
});

test('reports overview hides margin and net profit from non-owners', async () => {
  const router = require('../src/routes/reports');
  const handler = router.stack.find((layer) => layer.route?.path === '/overview').route.stack.at(-1).handle;
  let body;
  await handler(
    { user: { role: 'manager', branch_id: 4 }, query: { start: '2026-11-01', end: '2026-11-03' } },
    { json(value) { body = value; } },
    (error) => { throw error; },
  );

  assert.equal(body.data.summary.profit_margin_percent, undefined);
  assert.equal(body.data.summary.net_profit, undefined);
  assert.equal(body.data.previous_summary.profit_margin_percent, undefined);
  assert.equal(body.data.previous_summary.net_profit, undefined);
});
