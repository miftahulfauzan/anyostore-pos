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
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  execute: async (sql) => {
    if (sql.includes('COUNT(*) AS transactions')) return [[{ transactions: 4, amount: 400000 }]];
    if (sql.includes('SUM(ti.cost')) return [[{ amount: 100000 }]];
    return [[{ amount: 20000, income: 0 }]];
  },
} };
delete require.cache[routePath];
const router = require(routePath);

function getHandler() {
  const layer = router.stack.find((item) => item.route?.path === '/profit-loss');
  assert.ok(layer, 'GET /profit-loss harus tersedia');
  return layer.route.stack.at(-1).handle;
}

function response() {
  return {
    body: null,
    json(body) { this.body = body; return this; },
  };
}

test('profit-loss hides net profit from non-owners', async () => {
  const res = response();
  await getHandler()({
    user: { role: 'manager', branch_id: 4 },
    query: { start: '2026-11-01', end: '2026-11-03' },
  }, res, (error) => { throw error; });

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.net_profit, undefined);
  assert.equal(res.body.data.gross_profit, 300000);
});

test('profit-loss keeps net profit for owners', async () => {
  const res = response();
  await getHandler()({
    user: { role: 'owner', branch_id: 4 },
    query: { start: '2026-11-01', end: '2026-11-03', branch_id: '4' },
  }, res, (error) => { throw error; });

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.net_profit, 280000);
});
