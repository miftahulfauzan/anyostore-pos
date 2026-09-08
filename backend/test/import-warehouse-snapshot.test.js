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

test('pencocokan memprioritaskan nama produk dan tidak membuat produk dummy', () => {
  const result = planSnapshotMatches(
    [
      { target: 'rak riject', sku: 'AB12', name: 'AB12', quantity: 8 },
      { target: 'rak riject', sku: 'A100', name: 'A100', quantity: 2 },
      { target: 'rak riject', sku: 'A105', name: 'A105', quantity: 2 },
      { target: 'rak riject', sku: 'AB70-BORDIR', name: 'AB70 BORDIR', quantity: 5 },
      { target: 'rak riject', sku: 'MISSING', name: 'Tidak Ada', quantity: 1 },
      { target: 'gudang riject perbaikan', sku: 'AB83', name: 'AB83', quantity: 4 },
    ],
    [
      { id: 10, branch_id: 2, sku: 'B2-AB12', name: 'AB12', variant_count: 0 },
      { id: 12, branch_id: 2, sku: 'A100-2', name: 'A100', variant_count: 0 },
      { id: 13, branch_id: 2, sku: 'A105-2', name: 'A105 Cheongsam', variant_count: 0 },
      { id: 14, branch_id: 2, sku: 'AB70-BORDIR-2', name: 'AB70-BORDIR', variant_count: 0 },
      { id: 11, branch_id: 2, sku: 'AB83', name: 'AB83', variant_count: 2 },
    ],
  );
  assert.equal(result.matched.length, 4);
  assert.equal(result.matched[0].product.id, 10);
  assert.equal(result.matched[0].matchBy, 'name');
  assert.equal(result.matched[1].product.id, 12);
  assert.equal(result.matched[1].matchBy, 'name');
  assert.equal(result.matched[2].product.id, 13);
  assert.equal(result.matched[2].matchBy, 'name-prefix');
  assert.equal(result.matched[3].product.id, 14);
  assert.equal(result.matched[3].matchBy, 'name');
  assert.equal(result.missing[0].sku, 'MISSING');
  assert.equal(result.variantBlocked[0].sku, 'AB83');
  assert.equal(result.safe, false);
});

test('pencocokan lewat nama menolak nama yang tidak unik', () => {
  const result = planSnapshotMatches(
    [{ target: 'rak riject', sku: 'OLD-AC03', name: 'AC03', quantity: 1 }],
    [
      { id: 20, branch_id: 2, sku: 'AC03-A', name: 'AC03', variant_count: 0 },
      { id: 21, branch_id: 2, sku: 'AC03-B', name: 'AC03', variant_count: 0 },
    ],
  );
  assert.equal(result.matched.length, 0);
  assert.equal(result.missing.length, 0);
  assert.deepEqual(result.ambiguous[0].candidates.map((candidate) => candidate.id), [20, 21]);
  assert.equal(result.safe, false);
});
