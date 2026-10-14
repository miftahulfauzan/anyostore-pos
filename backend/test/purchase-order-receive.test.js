const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const db = require('../src/db');
const router = require('../src/routes/purchase-orders');

const receive = router.stack.find((layer) => layer.route?.path === '/:id/receive').route.stack.at(-1).handle;
const create = router.stack.find((layer) => layer.route?.path === '/' && layer.route.methods.post).route.stack.at(-1).handle;

test('PO creation rejects product from another branch before insertion', async () => {
  const original = db.getConnection;
  let inserts = 0;
  let rolledBack = false;
  db.getConnection = async () => ({
    async beginTransaction() {},
    async rollback() { rolledBack = true; },
    release() {},
    async execute(sql) {
      if (sql.startsWith('SELECT id FROM suppliers')) return [[{ id: 2 }]];
      if (sql.startsWith('SELECT id FROM products')) return [[]];
      if (sql.startsWith('INSERT')) inserts += 1;
      return [[]];
    },
  });
  try {
    let error;
    await create(
      { body: { supplier_id: 2, items: [{ product_id: 99, quantity: 1, unit_cost: 10 }] }, user: { branch_id: 1, id: 6 } },
      {},
      (value) => { error = value; }
    );
    assert.match(error.message, /Produk PO bukan milik cabang ini/);
    assert.equal(error.status, 400);
    assert.equal(inserts, 0);
    assert.equal(rolledBack, true);
  } finally { db.getConnection = original; }
});

test('partial PO receipt is cumulative and finishes only at ordered quantity', async () => {
  const original = db.getConnection;
  const state = { received: 0, status: 'ordered', stock: 0, commits: 0 };
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() {},
    release() {},
    async execute(sql, params = []) {
      if (sql.includes('FROM purchase_orders WHERE')) return [[state.status === 'completed' ? undefined : { id: 8 }].filter(Boolean)];
      if (sql.includes('FROM warehouses WHERE')) return [[{ id: 2 }]];
      if (sql.includes('FROM purchase_order_items WHERE id')) return [[{ id: 3, product_id: 4, variant_id: null, quantity: 5, received_qty: state.received, unit_cost: 10 }]];
      if (sql.includes('FROM warehouse_stocks WHERE')) return [[{ id: 9, quantity: state.stock, revision: 1 }]];
      if (sql.startsWith('UPDATE warehouse_stocks')) { state.stock = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO stock_mutations')) return [{ insertId: 5 }];
      if (sql.startsWith('UPDATE purchase_order_items')) { state.received += params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT COUNT(*) AS count')) return [[{ count: state.received < 5 ? 1 : 0 }]];
      if (sql.startsWith('UPDATE purchase_orders SET')) { state.status = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE products')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
  db.getConnection = async () => connection;
  try {
    const call = async (quantity) => {
      let payload;
      let error;
      await receive(
        { params: { id: '8' }, body: { warehouse_id: 2, items: [{ po_item_id: 3, quantity }] }, user: { branch_id: 1, id: 6 } },
        { json(value) { payload = value; } },
        (value) => { error = value; }
      );
      return { payload, error };
    };
    assert.equal((await call(2)).payload.data.status, 'received');
    assert.equal(state.received, 2);
    assert.equal((await call(3)).payload.data.status, 'completed');
    assert.equal(state.stock, 5);
    assert.equal(state.commits, 2);
    assert.ok((await call(1)).error);
    assert.equal(state.stock, 5);
  } finally { db.getConnection = original; }
});
