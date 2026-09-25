const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('stock-total mengirim foto utama produk untuk katalog mobile', async () => {
  const dbPath = require.resolve('../src/db');
  const queries = [];
  const dbStub = {
    execute: async (sql) => {
      queries.push(sql);
      if (sql.includes('FROM products p')) {
        return [[{
          id: 10,
          name: 'Kemeja Denim',
          sku: 'B4-KEMEJA',
          product_stock: 5,
          min_stock: 1,
          category_name: 'Denim',
          branch_name: 'Gudang Utama',
          total_stock: 5,
          reserved: 0,
          variant_count: 0,
          colors: null,
          photo_path: '/uploads/kemeja.jpg',
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: dbStub,
  };

  const router = require('../src/routes/inventory');
  const layer = router.stack.find(
    (item) => item.route?.path === '/stock-total' && item.route.methods.get,
  );
  assert.ok(layer, 'route stock-total harus ada');
  const handler = layer.route.stack.at(-1).handle;
  const res = response();
  let nextError;
  await handler(
    { user: { role: 'admin', branch_id: 1 }, query: {} },
    res,
    (error) => { nextError = error; },
  );

  assert.equal(nextError, undefined);
  assert.equal(res.body.data.products[0].photo_path, '/uploads/kemeja.jpg');
  assert.match(queries[0], /photo_path/);
  assert.match(queries[0], /product_photos/);
});
