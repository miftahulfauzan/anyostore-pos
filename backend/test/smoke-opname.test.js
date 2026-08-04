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
    { body: { warehouse_id: 1, notes: 'cek fisik', items: [{ product_id: 10, physical_stock: 5 }] }, user: { id: 2, branch_id: 1 }, ip: '127.0.0.1', get: () => null },
    res,
    (err) => { nextCalled = true; if (err) console.error(err.message); }
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 201);
  assert.equal(opnameInsert.params[1], 1);
});
