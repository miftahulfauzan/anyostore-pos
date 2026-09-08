const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSnapshotTarget,
  parseSnapshotRows,
  planSnapshotMatches,
} = require('../scripts/import-warehouse-snapshot');

test('target PDF dipetakan ke dua cabang gudang yang benar', () => {
  assert.equal(normalizeSnapshotTarget('Riject'), 'rak riject');
  assert.equal(normalizeSnapshotTarget('Rak Riject'), 'rak riject');
  assert.equal(normalizeSnapshotTarget('Riject Perbaikan'), 'gudang riject perbaikan');
  assert.equal(normalizeSnapshotTarget('Gudang Riject Perbaikan'), 'gudang riject perbaikan');
  assert.equal(normalizeSnapshotTarget('Gudang Utama'), null);
});

test('CSV snapshot menerima stok nol dan menolak baris ambigu', () => {
  const rows = parseSnapshotRows([
    { Tujuan: 'Riject', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '8' },
    { Tujuan: 'Riject Perbaikan', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '57' },
    { Tujuan: 'Riject', SKU: 'A103', 'Nama Produk': 'A103', Qty: '0' },
  ]);
  assert.deepEqual(rows[0], { target: 'rak riject', sku: 'AB12', name: 'AB12', quantity: 8 });
  assert.equal(rows[2].quantity, 0);
  assert.throws(
    () => parseSnapshotRows([{ Tujuan: 'Riject', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '-1' }]),
    /Qty tidak valid/,
  );
  assert.throws(
    () => parseSnapshotRows([{ Tujuan: 'Riject', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '' }]),
    /Qty tidak valid/,
  );
  assert.throws(
    () => parseSnapshotRows([
      { Tujuan: 'Riject', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '8' },
      { Tujuan: 'Riject', SKU: 'AB12', 'Nama Produk': 'AB12', Qty: '9' },
    ]),
    /duplikat/,
  );
});

test('pencocokan memakai SKU dasar dan tidak membuat produk dummy', () => {
  const result = planSnapshotMatches(
    [
      { target: 'rak riject', sku: 'AB12', name: 'AB12', quantity: 8 },
      { target: 'rak riject', sku: 'MISSING', name: 'Tidak Ada', quantity: 1 },
      { target: 'gudang riject perbaikan', sku: 'AB83', name: 'AB83', quantity: 4 },
    ],
    [
      { id: 10, branch_id: 2, sku: 'B2-AB12', name: 'AB12', variant_count: 0 },
      { id: 11, branch_id: 2, sku: 'AB83', name: 'AB83', variant_count: 2 },
    ],
  );
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].product.id, 10);
  assert.equal(result.missing[0].sku, 'MISSING');
  assert.equal(result.variantBlocked[0].sku, 'AB83');
  assert.equal(result.safe, false);
});

