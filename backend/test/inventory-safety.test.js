const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOpnameItems, assertStockSnapshot, matchingVariant, validateTransferItems } = require('../src/inventory-safety');

const counted = { product_id: 1, variant_id: null, physical_stock: 3, expected_stock: 4, expected_revision: 2 };
test('opname requires an explicit count and original snapshot, including zero counts', () => {
  assert.doesNotThrow(() => validateOpnameItems([{ ...counted, physical_stock: 0 }]));
  for (const value of ['', null, undefined, -1, 1.5, ' ', false]) {
    assert.throws(() => validateOpnameItems([{ ...counted, physical_stock: value }]), { status: 400 });
  }
  assert.throws(() => validateOpnameItems([{ product_id: 1, physical_stock: 0 }]), { status: 400 });
  assert.throws(() => validateOpnameItems([counted, counted]), { status: 400 });
});
test('opname rejects stale quantity AND ABA changes with the same quantity', () => {
  assert.doesNotThrow(() => assertStockSnapshot(counted, { quantity: 4, revision: 2 }));
  assert.throws(() => assertStockSnapshot(counted, { quantity: 5, revision: 2 }), { status: 409 });
  assert.throws(() => assertStockSnapshot(counted, { quantity: 4, revision: 4 }), { status: 409 });
  assert.doesNotThrow(() => assertStockSnapshot({ ...counted, expected_stock: 0, expected_revision: 0 }, undefined));
});
test('transfer variant identity includes color and size, supports size-only, and refuses ambiguity', () => {
  const rows = [{ id: 1, color: 'Denim', size: 'M' }, { id: 2, color: 'denim', size: 'L' }];
  assert.equal(matchingVariant(rows, { color: ' DENIM ', size: 'l' }).id, 2);
  assert.equal(matchingVariant(rows, { color: 'Denim', size: 'XL' }), null);
  assert.equal(matchingVariant([{ id: 3, color: null, size: 'L' }], { color: '', size: 'L' }).id, 3);
  assert.throws(() => matchingVariant([...rows, { id: 4, color: 'Denim', size: 'L' }], rows[1]), { status: 409 });
});
test('transfer validates IDs and whole positive quantities without coercing blank or bool', () => {
  assert.doesNotThrow(() => validateTransferItems([{ product_id: 1, variant_id: null, quantity: '2' }]));
  for (const quantity of ['', false, 0, -1, 1.5]) {
    assert.throws(() => validateTransferItems([{ product_id: 1, quantity }]), { status: 400 });
  }
  assert.throws(() => validateTransferItems([{ product_id: 1, variant_id: -2, quantity: 1 }]), { status: 400 });
});
