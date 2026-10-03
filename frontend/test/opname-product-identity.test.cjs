const test = require('node:test');
const assert = require('node:assert/strict');
const { opnameProductSubLabel } = require('../app/inventory/opname/opname-state.cjs');

test('label opname membedakan SKU dan varian yang bernama sama', () => {
  assert.equal(
    opnameProductSubLabel({ sku: 'A100', variant_color: 'Biru', variant_size: 'M' }),
    'A100 · Biru · M',
  );
});

test('label opname tetap rapi saat salah satu detail varian kosong', () => {
  assert.equal(opnameProductSubLabel({ sku: 'A100', variant_color: '', variant_size: 'M' }), 'A100 · M');
  assert.equal(opnameProductSubLabel({ sku: null, variant_color: null, variant_size: null }), '');
});
