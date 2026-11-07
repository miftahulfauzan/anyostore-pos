const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const dbPath = path.resolve(__dirname, '../src/db.js');
const routePath = path.resolve(__dirname, '../src/routes/finance.js');
const calls = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  execute: async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id FROM branches')) return [[{ id: 9 }]];
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 21 }]];
    return [[{
      id: 5,
      name: 'Sewa toko',
      amount: 250000,
      type: 'expense',
      payment_method: 'cash',
      expense_date: '2026-11-05',
      notes: 'Catatan biaya',
      category: 'Operasional',
      category_type: 'expense',
      branch_name: 'Blok B',
      status: 'approved',
    }]];
  },
} };
delete require.cache[routePath];
const router = require(routePath);

function handler() {
  const layer = router.stack.find((item) => item.route?.path === '/expenses' && item.route.methods.get);
  assert.ok(layer, 'GET /expenses harus tersedia');
  return layer.route.stack.at(-1).handle;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('expense history accepts validated filters and returns pagination metadata', async () => {
  calls.length = 0;
  const res = response();
  let nextError = null;
  await handler()({
    user: { id: 1, role: 'owner', branch_id: 4 },
    query: {
      type: 'expense',
      branch_id: '9',
      date_from: '2026-11-01',
      date_to: '2026-11-07',
      category_id: '3',
      payment_method: 'cash',
      search: 'sewa',
      page: '2',
      limit: '20',
    },
  }, res, (error) => { nextError = error; });

  assert.equal(nextError, null);
  assert.equal(res.body.success, true);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.total, 21);
  assert.equal(res.body.totalPages, 2);
  assert.equal(res.body.data[0].notes, 'Catatan biaya');
  const listCall = calls.find((call) => call.sql.includes('SELECT e.id'));
  assert.ok(listCall);
  assert.match(listCall.sql, /e\.expense_date >= \?/);
  assert.match(listCall.sql, /e\.expense_date <= \?/);
  assert.match(listCall.sql, /e\.category_id = \?/);
  assert.match(listCall.sql, /e\.payment_method = \?/);
  assert.match(listCall.sql, /e\.name LIKE \?/);
  assert.match(listCall.sql, /LIMIT 20 OFFSET 20/);
  assert.ok(listCall.params.includes('2026-11-01'));
  assert.ok(listCall.params.includes('2026-11-07'));
  assert.ok(listCall.params.includes(3));
  assert.ok(listCall.params.includes('%sewa%'));
});
