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

test('posisi rak dinormalisasi dan dibatasi 100 karakter', () => {
  const { normalizeRackPosition } = require('../src/rack-position');
  assert.equal(normalizeRackPosition('  A-01 / Rak 2  '), 'A-01 / Rak 2');
  assert.equal(normalizeRackPosition('   '), null);
  assert.equal(normalizeRackPosition(null), null);
  assert.throws(() => normalizeRackPosition('x'.repeat(101)), /100 karakter/);
});

test('stock-by-warehouse mengirim posisi rak per gudang', async () => {
  const dbPath = require.resolve('../src/db');
  const queries = [];
  const dbStub = {
    execute: async (sql) => {
      queries.push(sql);
      if (sql.includes('FROM warehouse_stocks ws')) {
        return [[{
          branch_name: 'Gudang Utama',
          warehouse_id: 2,
          warehouse_name: 'Gudang Utama',
          product_id: 10,
          product_name: 'Kemeja Denim',
          sku: 'B4-KEMEJA',
          photo_path: null,
          variant_id: null,
          variant_color: null,
          quantity: 8,
          reserved: 0,
          rack_position: 'A-01 / Rak 2',
          min_stock: 1,
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };

  const router = require('../src/routes/inventory');
  const layer = router.stack.find(
    (item) => item.route?.path === '/stock-by-warehouse' && item.route.methods.get,
  );
  assert.ok(layer, 'route stock-by-warehouse harus ada');
  const handler = layer.route.stack.at(-1).handle;
  const res = response();
  let nextError;
  await handler({ user: { role: 'admin', branch_id: 1 }, query: {} }, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(res.body.data[0].rack_position, 'A-01 / Rak 2');
  assert.match(queries[0], /ws\.rack_position/);
});

test('tersedia endpoint untuk menyimpan posisi rak produk di gudang', () => {
  const inventoryRoute = require('fs').readFileSync(require.resolve('../src/routes/inventory'), 'utf8');
  assert.match(inventoryRoute, /router\.put\('\/stock-location'/);
  assert.match(inventoryRoute, /rack_position/);
});

test('PUT stock-location memperbarui posisi rak tanpa mengubah saldo stok', async () => {
  const dbModule = require('../src/db');
  const statements = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT id, branch_id FROM warehouses')) return [[{ id: 2, branch_id: 1 }], []];
      if (sql.startsWith('SELECT id, branch_id FROM products')) return [[{ id: 10, branch_id: 1 }], []];
      if (sql.startsWith('SELECT id FROM warehouse_stocks')) return [[{ id: 99 }], []];
      if (sql.startsWith('UPDATE warehouse_stocks')) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  dbModule.getConnection = async () => connection;
  const router = require('../src/routes/inventory');
  const layer = router.stack.find(
    (item) => item.route?.path === '/stock-location' && item.route.methods.put,
  );
  assert.ok(layer, 'route stock-location harus ada');
  const handler = layer.route.stack.at(-1).handle;
  const res = response();
  let nextError;
  await handler(
    { user: { role: 'admin', branch_id: 1 }, body: { warehouse_id: 2, product_id: 10, rack_position: ' A-01 ' } },
    res,
    (error) => { nextError = error; },
  );
  assert.equal(nextError, undefined);
  assert.equal(res.body.data.rack_position, 'A-01');
  assert.equal(statements.at(-1).sql, 'UPDATE warehouse_stocks SET rack_position = ? WHERE id = ?');
  assert.deepEqual(statements.at(-1).params, ['A-01', 99]);
});
