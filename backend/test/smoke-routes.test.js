const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie() { return this; },
    clearCookie() { return this; },
  };
}

test('semua router backend bisa dimuat (tidak ada syntax/reference error)', () => {
  const dbPath = require.resolve('../src/db');
  const dbStub = {
    execute: async () => [[], []],
    query: async () => [[], []],
    getConnection: async () => ({ execute: async () => [[], []], beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: async () => {} }),
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };

  for (const name of [
    'transactions', 'returns', 'reports', 'cash-drawer', 'products', 'inventory',
    'inventory-control', 'users', 'settings', 'finance', 'commissions', 'promotions',
    'tax', 'printer', 'dashboard', 'suppliers', 'customers', 'purchase-orders', 'public',
  ]) {
    const mod = require(`../src/routes/${name}`);
    assert.ok(mod, `route ${name} harus ter-export`);
  }
});
