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

test('opname stok memakai branchId dari gudang (bukan ReferenceError)', async () => {
  const dbPath = require.resolve('../src/db');
  const opnameInsert = { params: null };
  const conn = {
    async execute(sql, params) {
      if (sql.includes('FROM warehouses')) return [[{ id: 1, branch_id: 1 }], []];
      if (sql.includes('FROM products WHERE id IN')) return [[{ id: 10 }], []];
      if (sql.includes('INSERT INTO stock_opnames')) { opnameInsert.params = params; return [{ insertId: 5 }, []]; }
      if (sql.trim().toUpperCase().startsWith('SELECT')) return [[], []];
      return [[]];
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: async () => {},
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: async () => [[], []], query: async () => [[], []], getConnection: async () => conn } };

  const router = require('../src/routes/inventory-control');
  const layer = router.stack.find((l) => l.route && l.route.path === '/opnames' && l.route.methods.post);
  assert.ok(layer, 'route opnames harus ada');
  const handle = layer.route.stack[layer.route.stack.length - 1].handle;
  const res = response();
  let nextCalled = false;
  await handle(
    { body: { warehouse_id: 1, notes: 'cek fisik', items: [{ product_id: 10, physical_stock: 5, expected_stock: 0, expected_revision: 0 }] }, user: { id: 2, branch_id: 1 }, ip: '127.0.0.1', get: () => null },
    res,
    (err) => { nextCalled = true; if (err) console.error(err.message); }
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 201);
  assert.equal(opnameInsert.params[1], 1);
});

test('opname mengoreksi stok sistem negatif yang dikembalikan sebagai string', async () => {
  const dbPath = require.resolve('../src/db');
  const dbMock = require.cache[dbPath].exports;
  const originalGetConnection = dbMock.getConnection;
  const mutation = { params: null };
  const conn = {
    async execute(sql, params) {
      if (sql.includes('FROM warehouses')) return [[{ id: 1, branch_id: 1 }], []];
      if (sql.includes('FROM products WHERE id IN')) return [[{ id: 10 }], []];
      if (sql.includes('FROM warehouse_stocks')) return [[{ id: 7, quantity: '-1', revision: '7' }], []];
      if (sql.includes('INSERT INTO stock_opnames')) return [{ insertId: 8 }, []];
      if (sql.includes('INSERT INTO stock_opname_items')) return [{ insertId: 9 }, []];
      if (sql.includes('INSERT INTO stock_mutations')) { mutation.params = params; return [{ insertId: 10 }, []]; }
      return [[]];
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: async () => {},
  };
  dbMock.getConnection = async () => conn;
  try {
    const router = require('../src/routes/inventory-control');
    const layer = router.stack.find((l) => l.route && l.route.path === '/opnames' && l.route.methods.post);
    const handle = layer.route.stack[layer.route.stack.length - 1].handle;
    const res = response();
    let nextError;
    await handle(
      { body: { warehouse_id: 1, items: [{ product_id: 10, physical_stock: 0, expected_stock: '-1', expected_revision: '7' }] }, user: { id: 2, branch_id: 1 }, ip: '127.0.0.1', get: () => null },
      res,
      (error) => { nextError = error; },
    );
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.total_selisih, 1);
    assert.equal(mutation.params[10], 1, 'delta opname harus mengubah -1 menjadi 0');
  } finally {
    dbMock.getConnection = originalGetConnection;
  }
});

test('riwayat opname mengembalikan ringkasan dan detail item', async () => {
  const dbPath = require.resolve('../src/db');
  const dbMock = require.cache[dbPath].exports;
  const originalExecute = dbMock.execute;
  dbMock.execute = async (sql) => {
    if (sql.includes('FROM stock_opnames so')) {
      return [[{
        id: 9,
        opname_date: '2026-09-29',
        total_items: 2,
        total_selisih: -1,
        status: 'approved',
        notes: 'Cek rak A',
        created_at: '2026-09-29 10:00:00',
        warehouse_id: 3,
        warehouse_name: 'Gudang Utama',
        branch_id: 1,
        branch_name: 'Anyostore',
        created_by_name: 'Resti',
        item_count: 2,
      }], []];
    }
    if (sql.includes('FROM stock_opname_items soi')) {
      return [[{
        opname_id: 9,
        product_id: 10,
        variant_id: null,
        product_name: 'A100',
        product_sku: 'B4-A100-2',
        variant_color: null,
        variant_size: null,
        system_stock: 5,
        physical_stock: 4,
        selisih: -1,
        item_notes: null,
      }], []];
    }
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }], []];
    return [[], []];
  };
  try {
    const router = require('../src/routes/inventory-control');
    const layer = router.stack.find((l) => l.route && l.route.path === '/opnames' && l.route.methods.get);
    assert.ok(layer, 'route GET /opnames harus ada');
    const handle = layer.route.stack[layer.route.stack.length - 1].handle;
    const res = response();
    let nextError;
    await handle(
      { query: { branch_id: 'all', page: '1', limit: '25' }, user: { id: 2, role: 'owner', branch_id: 1 } },
      res,
      (error) => { nextError = error; },
    );
    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data[0].id, 9);
    assert.equal(res.body.data[0].item_count, 2);
    assert.deepEqual(res.body.data[0].items, [{
      opname_id: 9,
      product_id: 10,
      variant_id: null,
      product_name: 'A100',
      product_sku: 'B4-A100-2',
      variant_color: null,
      variant_size: null,
      system_stock: 5,
      physical_stock: 4,
      selisih: -1,
      item_notes: null,
    }]);
  } finally {
    dbMock.execute = originalExecute;
  }
});
