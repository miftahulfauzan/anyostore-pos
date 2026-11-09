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
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, name, address, phone FROM branches')) return [[{ id: 2, name: 'Toko B', address: 'Blok B', phone: '0812' }]];
      if (sql.includes('SELECT name FROM users')) return [[{ name: 'Kasir B' }]];
      if (sql.includes('receipt_count')) return [[{ receipt_count: '7', total_sales: '2415000' }]];
      if (sql.includes('FROM returns')) return [[]];
      if (sql.includes('FROM transaction_payments')) return [[
        { payment_method: 'cash', sales: '1205000', cancellations: '0' },
        { payment_method: 'qris', sales: '1210000', cancellations: '0' },
      ]];
      if (sql.includes('FROM cash_drawer_movements')) return [[{ net: '0' }]];
      if (sql.includes("FROM expenses e") && sql.includes("payment_method = 'cash'")) return [[{ expense: '760000', income: '0' }]];
      if (sql.includes('FROM expenses e')) return [[{ expense: '760000', income: '0' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  },
};

const router = require('../src/routes/reports');
const { localDateString } = require('../src/local-date');
const layer = router.stack.find((item) => item.route?.path === '/daily-closing');
const handler = layer.route.stack.at(-1).handle;

test('daily closing includes approved cash finance entries in the cash adjustment', async () => {
  calls.length = 0;
  let body;
  await handler(
    { user: { id: 11, role: 'owner', branch_id: 2 }, query: { date: '2026-11-07', branch_id: '2' } },
    { json(value) { body = value; }, status() { return this; } },
    (error) => { throw error; },
  );

  const cashFinanceCall = calls.find(({ sql }) => sql.includes("FROM expenses e") && sql.includes("payment_method = 'cash'"));
  assert.ok(cashFinanceCall, 'daily-closing harus mengambil Finance tunai');
  assert.match(cashFinanceCall.sql, /e\.status\s*=\s*'approved'/);
  assert.match(cashFinanceCall.sql, /e\.branch_id\s*=\s*\?/);
  assert.match(cashFinanceCall.sql, /e\.expense_date\s*=\s*\?/);
  assert.deepEqual(cashFinanceCall.params, [2, '2026-11-07']);
  assert.equal(body.data.methods.cash.cash_in_out, -760000);
  assert.equal(body.data.methods.cash.total, 445000);
  assert.equal(body.data.expected_total, 1655000);
  assert.equal(body.data.branch_id, 2);

  const returnsCall = calls.find(({ sql }) => sql.includes('FROM returns'));
  assert.match(returnsCall.sql, /CONVERT_TZ\(created_at/);
  const movementCall = calls.find(({ sql }) => sql.includes('FROM cash_drawer_movements'));
  assert.match(movementCall.sql, /CONVERT_TZ\(cdm\.created_at/);
});

test('daily closing tanpa tanggal memakai hari bisnis WIB saat ini', async () => {
  calls.length = 0;
  let body;
  await handler(
    { user: { id: 11, role: 'owner', branch_id: 2 }, query: { branch_id: '2' } },
    { json(value) { body = value; }, status() { return this; } },
    (error) => { throw error; },
  );

  const salesCall = calls.find(({ sql }) => sql.includes('receipt_count'));
  assert.equal(salesCall.params[1], localDateString());
  assert.equal(body.data.date, localDateString());
});
