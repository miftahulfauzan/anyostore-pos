const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSku, readRows } = require('../scripts/import-inventory-backup');

test('readRows memilih hanya riwayat Gudang Utama', () => {
  const backup = { reports: {
    stockMasuk: [{ id: 1, sku: 'A100', qty: 3, gudang: 'Gudang Utama', nomor: 'IN-1', tanggal: '2026-09-01' }, { id: 2, sku: 'A101', qty: 4, gudang: 'Riject' }],
    stockKeluar: [{ id: 3, sku: 'A100', qty: 1, gudang: 'Gudang Utama', nomor: 'OUT-1', tujuan: 'Toko' }],
  } };
  assert.equal(readRows(backup, 'stockMasuk', 'incoming').length, 1);
  assert.equal(readRows(backup, 'stockKeluar', 'outgoing')[0].description, 'Toko');
});

test('normalizeSku konsisten untuk pencocokan SKU', () => {
  assert.equal(normalizeSku(' A100 '), 'a100');
});
