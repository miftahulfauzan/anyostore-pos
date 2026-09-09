const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const productsRouter = require('../src/routes/products');
const db = require('../src/db');

test('normalizeVariants menerima color null ketika size terisi', () => {
  const variants = productsRouter.normalizeVariants([
    { id: 10, color: null, size: 'L', price: null },
  ]);

  assert.deepEqual(variants, [{
    id: 10,
    color: '',
    size: 'L',
    sku: null,
    barcode: null,
    price: null,
  }]);
});

test('normalizeVariants tetap menolak kombinasi kosong', () => {
  assert.throws(
    () => productsRouter.normalizeVariants([{ color: null, size: null }]),
    /wajib memiliki warna atau ukuran/
  );
});

test('admin gudang dapat menghapus produk pada cabang Riject Perbaikan yang dipilih', async () => {
  const originalExecute = db.execute;
  db.execute = async (sql, params) => {
    assert.match(sql, /type='gudang'/);
    assert.match(sql, /warehouse_catalog_delete_enabled=TRUE/);
    assert.deepEqual(params, [7]);
    return [[{ id: 7 }], []];
  };
  try {
    const branchId = await productsRouter.writableDeleteBranchId({
      user: { role: 'gudang', branch_id: 3 },
      body: {},
      query: { branch_id: '7' },
    });
    assert.equal(branchId, 7);
  } finally {
    db.execute = originalExecute;
  }
});

test('admin gudang tidak dapat menghapus produk pada cabang gudang lain melalui branch_id', async () => {
  const originalExecute = db.execute;
  db.execute = async (sql) => {
    assert.match(sql, /warehouse_catalog_delete_enabled=TRUE/);
    return [[], []];
  };
  try {
    await assert.rejects(productsRouter.writableDeleteBranchId({
      user: { role: 'gudang', branch_id: 3 },
      body: {},
      query: { branch_id: '2' },
    }), { status: 403 });
  } finally {
    db.execute = originalExecute;
  }
});

test('aksi tambah/edit produk admin gudang tetap memakai cabang akunnya', () => {
  const branchId = productsRouter.writableBranchId({
    user: { role: 'gudang', branch_id: 3 },
    body: { branch_id: 7 },
    query: {},
  });
  assert.equal(branchId, 3);
});
