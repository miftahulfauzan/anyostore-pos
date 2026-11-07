const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const dbPath = require.resolve('../src/db');
const calls = [];
const drawer = {
  id: 20,
  branch_id: 2,
  user_id: 11,
  opened_at: '2026-11-07 08:00:00',
  opening_amount: '100000',
  status: 'open',
};
const connection = {
  execute: async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT * FROM cash_drawers')) return [[drawer]];
    if (sql.includes('FROM transaction_payments')) return [[{ amount: '1205000' }]];
    if (sql.includes('FROM cash_drawer_movements')) return [[{ amount: '0' }]];
    if (sql.includes('FROM expenses')) return [[{ income: '0', expense: '760000' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  },
  release() {},
};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { getConnection: async () => connection },
};

const router = require('../src/routes/cash-drawer');
const layer = router.stack.find((item) => item.route?.path === '/summary');
const handler = layer.route.stack.at(-1).handle;

test('cash drawer expected cash includes approved cash finance entries', async () => {
  calls.length = 0;
  let body;
  await handler(
    { user: { id: 11, role: 'owner', branch_id: 2 } },
    { json(value) { body = value; } },
    (error) => { throw error; },
  );

  const financeCall = calls.find(({ sql }) => sql.includes('FROM expenses'));
  assert.ok(financeCall, 'expected cash harus mengambil Finance tunai');
  assert.match(financeCall.sql, /status\s*=\s*'approved'/);
  assert.match(financeCall.sql, /payment_method\s*=\s*'cash'/);
  assert.match(financeCall.sql, /created_at\s*>=/);
  assert.ok(financeCall.params.includes(drawer.branch_id));
  assert.ok(financeCall.params.includes(drawer.opened_at));
  assert.equal(body.data.expected_cash, 545000);
});
