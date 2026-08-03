const test = require('node:test');
const assert = require('node:assert/strict');
const { adjustStock } = require('../src/stock');

function makeConnection({ existing = false } = {}) {
  const calls = [];
  const conn = {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params: params || [] });
      if (sql.includes('SELECT id, quantity FROM warehouse_stocks')) {
        return existing ? [[{ id: 9, quantity: 5 }], []] : [[], []];
      }
      if (sql.includes('INSERT INTO warehouse_stocks')) return [{ insertId: 3 }, []];
      if (sql.includes('UPDATE warehouse_stocks')) return [{ affectedRows: 1 }, []];
      if (sql.includes('UPDATE products SET stock')) return [{ affectedRows: 1 }, []];
      if (sql.includes('UPDATE product_variants')) return [{ affectedRows: 1 }, []];
      if (sql.includes('INSERT INTO stock_mutations')) return [{ insertId: 42 }, []];
      throw new Error('unexpected sql: ' + sql);
    },
  };
  return conn;
}

test('adjustStock menulis warehouse_stocks + products.stock + stock_mutations sekaligus (baris baru)', async () => {
  const conn = makeConnection({ existing: false });
  const result = await adjustStock(conn, {
    branchId: 1, warehouseId: 2, productId: 3, variantId: null, delta: 10,
    userId: 4, type: 'purchase', referenceType: 'purchase_order', referenceId: 5,
  });
  assert.equal(result.before, 0);
  assert.equal(result.after, 10);
  assert.equal(result.mutationId, 42);
  assert.equal(conn.calls.length, 4);
  assert.ok(conn.calls.some((c) => c.sql.includes('INSERT INTO warehouse_stocks')));
  assert.ok(conn.calls.some((c) => c.sql.includes('UPDATE products SET stock')));
  const mutationCall = conn.calls.find((c) => c.sql.includes('INSERT INTO stock_mutations'));
  assert.ok(mutationCall);
  assert.equal((mutationCall.sql.match(/\?/g) || []).length, mutationCall.params.length);
});

test('adjustStock mengupdate baris existing + varian', async () => {
  const conn = makeConnection({ existing: true });
  await adjustStock(conn, {
    branchId: 1, warehouseId: 2, productId: 3, variantId: 7, delta: -2,
    userId: 4, type: 'sale', referenceType: 'transaction', referenceId: 5,
  });
  assert.equal(conn.calls.length, 5);
  assert.ok(conn.calls.some((c) => c.sql.includes('UPDATE warehouse_stocks SET quantity = ?')));
  assert.ok(conn.calls.some((c) => c.sql.includes('UPDATE product_variants SET stock')));
  assert.ok(conn.calls.some((c) => c.sql.includes('channel')));
});

test('adjustStock dengan createdAt: jumlah placeholder = jumlah parameter', async () => {
  const conn = makeConnection({ existing: false });
  await adjustStock(conn, {
    branchId: 1, warehouseId: 2, productId: 3, variantId: null, delta: 5,
    userId: 4, type: 'purchase', referenceType: 'manual_incoming', referenceId: 123,
    batchNumber: 'BATCH-20260803-001', createdAt: '2026-08-03',
  });
  const mutationCall = conn.calls.find((c) => c.sql.includes('INSERT INTO stock_mutations'));
  assert.ok(mutationCall);
  assert.equal((mutationCall.sql.match(/\?/g) || []).length, mutationCall.params.length);
  assert.ok(mutationCall.sql.includes('created_at'));
  assert.ok(mutationCall.params.includes('2026-08-03'));
});
