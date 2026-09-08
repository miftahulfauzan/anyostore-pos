const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteCatalogProduct, productCapabilities } = require('../src/product-lifecycle');

function fixture({ history = 0, stock = 0, failDelete = false, missing = false } = {}) {
  const events = [];
  const connection = {
    beginTransaction: async () => events.push('begin'),
    commit: async () => events.push('commit'),
    rollback: async () => events.push('rollback'),
    release: () => events.push('release'),
    execute: async (sql) => {
      events.push(sql);
      if (sql.includes('FROM products WHERE')) return [missing ? [] : [{ id: 10, stock, name: 'AB12' }]];
      if (sql.includes('AS history_count')) return [[{ history_count: history }]];
      if (sql.includes('AS nonzero_count')) return [[{ nonzero_count: stock ? 1 : 0 }]];
      if (sql.startsWith('SELECT path')) return [[{ path: '/uploads/test.jpg' }]];
      if (failDelete && sql.startsWith('DELETE FROM product_variants')) throw Error('dependency failure');
      return [{ affectedRows: 1 }];
    },
  };
  return { events, pool: { getConnection: async () => connection, execute: async () => [[{ count: 0 }]] }, removeMedia: async () => events.push('media') };
}

test('mutasi lama melindungi produk: arsip tanpa menghapus stok/riwayat/media', async () => {
  const f = fixture({ history: 1 });
  const result = await deleteCatalogProduct({ ...f, id: 10, branchId: 7 });
  assert.equal(result.soft, true);
  assert.ok(f.events.some((sql) => sql.includes('stock_mutations') && sql.includes('AS history_count')));
  assert.equal(f.events.some((sql) => sql.startsWith('DELETE')), false);
  assert.equal(f.events.includes('media'), false);
  assert.ok(f.events.includes('commit'));
});
test('stok nonzero ditolak tanpa menghilangkan produk dari katalog', async () => {
  const f = fixture({ stock: 1 });
  await assert.rejects(deleteCatalogProduct({ ...f, id: 10, branchId: 7 }), { status: 409 });
  assert.equal(f.events.some((s) => /^(DELETE|UPDATE)/.test(s)), false);
  assert.ok(f.events.includes('rollback'));
});
test('produk kosong tanpa histori dihapus atomik, media hanya setelah commit', async () => {
  const f = fixture();
  assert.equal((await deleteCatalogProduct({ ...f, id: 10, branchId: 7 })).soft, false);
  assert.ok(f.events.indexOf('media') > f.events.indexOf('commit'));
  assert.equal(f.events.some((s) => s.startsWith('DELETE FROM stock_mutations')), false);
});
test('kegagalan hapus melakukan rollback dan tidak menyentuh file', async () => {
  const f = fixture({ failDelete: true });
  await assert.rejects(deleteCatalogProduct({ ...f, id: 10, branchId: 7 }), /dependency failure/);
  assert.ok(f.events.includes('rollback'));
  assert.equal(f.events.includes('commit'), false);
  assert.equal(f.events.includes('media'), false);
});
test('produk tidak ditemukan tidak dimutasi', async () => {
  const f = fixture({ missing: true });
  await assert.rejects(deleteCatalogProduct({ ...f, id: 10, branchId: 7 }), { status: 404 });
});
test('kegagalan membersihkan file setelah commit tidak melaporkan database gagal', async () => {
  const f = fixture();
  const result = await deleteCatalogProduct({ ...f, id: 10, branchId: 7, removeMedia: async () => { throw Error('disk busy'); } });
  assert.equal(result.soft, false);
  assert.equal(result.media_cleanup_pending, true);
  assert.equal(f.events.includes('rollback'), false);
});
test('foto yang dipakai produk lain tetap disimpan', async () => {
  const f = fixture();
  f.pool.execute = async () => [[{ count: 1 }]];
  await deleteCatalogProduct({ ...f, id: 10, branchId: 7 });
  assert.equal(f.events.includes('media'), false);
});
test('kemampuan katalog mengikuti role/cabang/grant stabil, bukan nama gudang', () => {
  const user = { role: 'gudang', branch_id: 3 };
  assert.deepEqual(productCapabilities(user, { branch_id: 3, branch_active: 1 }), { edit: true, copy: true, delete: true });
  assert.deepEqual(productCapabilities(user, { branch_id: 7, branch_active: 1, branch_type: 'gudang', warehouse_catalog_delete_enabled: 1 }), { edit: false, copy: false, delete: true });
  assert.deepEqual(productCapabilities(user, { branch_id: 8, branch_active: 1, branch_type: 'gudang', name: 'Gudang Riject Perbaikan' }), { edit: false, copy: false, delete: false });
  assert.deepEqual(productCapabilities({ role: 'kasir', branch_id: 3 }, { branch_id: 3, branch_active: 1 }), { edit: false, copy: false, delete: false });
});
