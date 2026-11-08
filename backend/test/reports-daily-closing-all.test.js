const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async (sql, params = []) => {
      const branchId = Number(params[0]);
      if (sql.includes('SELECT id, name, address, phone FROM branches') && sql.includes('is_active')) {
        return [[
          { id: 2, name: 'Toko B', address: 'Blok B', phone: '0812' },
          { id: 3, name: 'Gudang Utama', address: 'Gudang', phone: '0813' },
        ]];
      }
      if (sql.includes('SELECT id, name, address, phone FROM branches WHERE id=?')) {
        return [[{ id: 2, name: 'Toko B', address: 'Blok B', phone: '0812' }]];
      }
      if (sql.includes('SELECT name FROM users')) return [[{ name: 'Owner' }]];
      if (sql.includes('receipt_count')) {
        return [[branchId === 3
          ? { receipt_count: '1', total_sales: '50000' }
          : { receipt_count: '2', total_sales: '100000' }]];
      }
      if (sql.includes('FROM returns')) return [[]];
      if (sql.includes('FROM transaction_payments')) {
        return [[{ payment_method: 'cash', sales: branchId === 3 ? '50000' : '100000', cancellations: '0' }]];
      }
      if (sql.includes('FROM cash_drawer_movements')) return [[{ net: '0' }]];
      if (sql.includes("FROM expenses e") && sql.includes("payment_method = 'cash'")) {
        return [[{ expense: branchId === 3 ? '10000' : '20000', income: branchId === 3 ? '3000' : '7000' }]];
      }
      if (sql.includes('FROM expenses e')) {
        return [[{ expense: branchId === 3 ? '10000' : '20000', income: branchId === 3 ? '3000' : '7000' }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  },
};

const router = require('../src/routes/reports');
const layer = router.stack.find((item) => item.route?.path === '/daily-closing');
const handler = layer.route.stack.at(-1).handle;

test('owner daily closing aggregates all active branches including finance totals', async () => {
  let body;
  await handler(
    { user: { id: 11, role: 'owner', branch_id: 2 }, query: { date: '2026-11-08', branch_id: 'all' } },
    { json(value) { body = value; }, status() { return this; } },
    (error) => { throw error; },
  );

  assert.equal(body.data.branch_id, 'all');
  assert.equal(body.data.store, 'Semua Toko/Gudang');
  assert.equal(body.data.receipt_count, 3);
  assert.equal(body.data.total_sales, 150000);
  assert.equal(body.data.expenses, 30000);
  assert.equal(body.data.income, 10000);
  assert.equal(body.data.methods.cash.sales, 150000);
});
