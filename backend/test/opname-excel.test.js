const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { createOpnameWorkbook } = require('../src/opname-excel');

test('formulir opname mengikuti template: judul, header, stok sistem, fisik kosong', async () => {
  const workbook = createOpnameWorkbook({
    branchName: 'Toko B',
    warehouseName: 'Gudang B',
    dateLabel: '2026-11-20',
    products: [
      { id: 1, sku: 'B1-AB83', name: 'AB83', system_stock: 12 },
      { id: 2, sku: '', name: 'Tanpa SKU', system_stock: 0 },
    ],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const sheet = loaded.getWorksheet('Stok Opname');
  assert.ok(sheet, 'sheet Stok Opname harus ada');

  assert.equal(sheet.getCell('A2').value, 'FORMULIR STOK OPNAME MANUAL');
  assert.match(sheet.getCell('A3').value, /Gudang B/);
  assert.match(sheet.getCell('A3').value, /Toko B/);
  assert.match(sheet.getCell('A3').value, /2026-11-20/);

  assert.equal(sheet.getCell('A7').value, 'No.');
  assert.equal(sheet.getCell('B7').value, 'Kode Produk');
  assert.equal(sheet.getCell('C7').value, 'Stok Sistem');
  assert.equal(sheet.getCell('D7').value, 'Stok Fisik');
  assert.equal(sheet.getCell('E7').value, 'Selisih (+/-)');
  assert.equal(sheet.getCell('F7').value, 'Catatan');

  assert.equal(sheet.getCell('A8').value, 1);
  assert.equal(sheet.getCell('B8').value, 'AB83', 'kolom kode memakai nama/model seperti template');
  assert.match(sheet.getCell('B8').note || '', /SKU: B1-AB83/);
  assert.equal(sheet.getCell('C8').value, 12);
  assert.equal(sheet.getCell('D8').value, null, 'stok fisik harus kosong untuk diisi manual');
  assert.match(sheet.getCell('E8').value.formula, /D8-C8/);
  assert.equal(sheet.getCell('F8').value, null);

  // Produk tanpa SKU memakai nama agar kolom kode tidak kosong.
  assert.equal(sheet.getCell('B9').value, 'Tanpa SKU');
  assert.equal(sheet.getCell('C9').value, 0);
});

test('stok fisik punya validasi bilangan bulat dan selisih punya format tanda', async () => {
  const workbook = createOpnameWorkbook({
    dateLabel: '2026-11-20',
    products: [{ id: 1, sku: 'A100', system_stock: 5 }],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const sheet = loaded.getWorksheet('Stok Opname');
  assert.ok(sheet.getCell('D8').dataValidation);
  assert.equal(sheet.getCell('D8').dataValidation.type, 'whole');
  assert.equal(sheet.getCell('E8').numFmt, '+0;-0;0');
  assert.equal(sheet.getCell('E8').value.formula.includes('IF(OR('), true);
});