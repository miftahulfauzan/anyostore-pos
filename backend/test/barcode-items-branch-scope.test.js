const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const dbPath = require.resolve('../src/db');
let captured;
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async (sql, params) => {
      captured = { sql, params };
      return [[], []];
    },
  },
};

const router = require('../src/routes/inventory');
const layer = router.stack.find((item) => item.route?.path === '/barcode-items' && item.route.methods.get);
const handler = layer.route.stack.at(-1).handle;

async function requestBarcodeItems(user, query = {}) {
  captured = null;
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextError;
  await handler({ user, query }, res, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  return { res, query: captured };
}

test('Owner barcode list honors the selected branch instead of the account branch', async () => {
  const result = await requestBarcodeItems({ role: 'owner', branch_id: 1 }, { branch_id: '8' });
  assert.match(result.query.sql, /WHERE p\.branch_id = \? AND p\.is_active = TRUE/);
  assert.equal(result.query.params[0], 8);
});

test('Owner barcode list aggregates active branches when the shared context is all', async () => {
  const result = await requestBarcodeItems({ role: 'owner', branch_id: 1 }, { branch_id: 'all' });
  assert.match(result.query.sql, /p\.branch_id IN \(SELECT id FROM branches WHERE is_active = TRUE\)/);
  assert.deepEqual(result.query.params, []);
});

test('Non-owner barcode list remains limited to the user branch', async () => {
  const result = await requestBarcodeItems({ role: 'manager', branch_id: 5 }, { branch_id: '8' });
  assert.match(result.query.sql, /WHERE p\.branch_id = \? AND p\.is_active = TRUE/);
  assert.equal(result.query.params[0], 5);
});
