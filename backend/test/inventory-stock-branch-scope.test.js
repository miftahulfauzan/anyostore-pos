const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

test('stock opname hanya mengambil produk aktif dari cabang gudang yang dipilih', async () => {
  const dbPath = require.resolve('../src/db');
  let captured;
  const dbStub = {
    execute: async (sql, params) => {
      captured = { sql, params };
      return [[], []];
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };

  const router = require('../src/routes/inventory');
  const layer = router.stack.find(
    (item) => item.route?.path === '/stock' && item.route.methods.get,
  );
  assert.ok(layer, 'route stock harus ada');
  const handler = layer.route.stack.at(-1).handle;
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextError;

  await handler(
    { user: { role: 'owner', branch_id: 1 }, query: { warehouse_id: '20', branch_id: '8' } },
    res,
    (error) => { nextError = error; },
  );

  assert.equal(nextError, undefined);
  assert.match(captured.sql, /p\.branch_id\s*=\s*w\.branch_id/);
  assert.match(captured.sql, /p\.is_active\s*=\s*TRUE/);
  assert.match(captured.sql, /LEFT JOIN product_variants pv ON pv\.id = ws\.variant_id AND pv\.product_id = p\.id AND pv\.is_active = TRUE/);
  assert.match(captured.sql, /ws\.variant_id IS NULL OR pv\.id IS NOT NULL/);
  assert.deepEqual(captured.params, [20, 8, 8, 20, 8, 20]);
});
