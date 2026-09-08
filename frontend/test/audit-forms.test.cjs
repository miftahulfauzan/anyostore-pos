const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpnameRows, countedOpnameItems } = require('../app/inventory/opname/opname-state.cjs');
const { updateTransferQuantity, transferItems, createTransferAttempt } = require('../app/inventory/transfers/transfer-state.cjs');
const { productsQuery, productBranchQuery, bulkDeleteProducts } = require('../app/products/catalog-state.cjs');

test('opname starts uncounted and sends only explicit counts, including zero and unchanged', () => {
  const rows = createOpnameRows([
    { product_id: 1, variant_id: null, quantity: 10, stock_revision: '21' },
    { product_id: 2, variant_id: 4, quantity: 8, stock_revision: '22' },
    { product_id: 3, quantity: 5, stock_revision: '23' },
  ]);
  assert.deepEqual(countedOpnameItems(rows), []);
  rows[1].physical_stock = '8';
  rows[2].physical_stock = '0';
  assert.deepEqual(countedOpnameItems(rows), [
    { product_id: 2, variant_id: 4, physical_stock: 8, expected_stock: 8, expected_revision: '22' },
    { product_id: 3, variant_id: null, physical_stock: 0, expected_stock: 5, expected_revision: '23' },
  ]);
  rows[1].physical_stock = '';
  assert.equal(countedOpnameItems(rows).length, 1);
});

test('opname rejects negative, fractional and invalid counts and missing revision', () => {
  for (const value of ['-1', '1.5', 'NaN', 'Infinity']) {
    assert.throws(() => countedOpnameItems([{ physical_stock: value, expected_stock: 1, expected_revision: '2' }]), /bilangan bulat/);
  }
  assert.throws(() => countedOpnameItems([{ physical_stock: '1', expected_stock: 1 }]), /Muat ulang/);
});

test('clearing transfer quantity keeps its row; submit rejects blanks and non-positive integers', () => {
  const original = [{ key: '1', product_id: 1, quantity: '5' }];
  const cleared = updateTransferQuantity(original, '1', '');
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].quantity, '');
  assert.equal(original[0].quantity, '5');
  for (const quantity of ['', ' ', '0', '-2', '1.2', 'invalid']) {
    assert.throws(() => transferItems([{ product_id: 1, quantity }]), /bilangan bulat/);
  }
  assert.deepEqual(transferItems(updateTransferQuantity(cleared, '1', '12')), [{ product_id: 1, variant_id: null, quantity: 12 }]);
});

test('transfer retry reuses UUID; editing or completing a transfer creates a new attempt', () => {
  let counter = 0;
  const attempt = createTransferAttempt(() => `uuid-${++counter}`);
  const payload = { from_warehouse_id: 1, to_warehouse_id: 2, items: [{ product_id: 3, quantity: 5 }], notes: '' };
  const first = attempt.forPayload(payload);
  assert.equal(attempt.forPayload(JSON.parse(JSON.stringify(payload))), first);
  assert.notEqual(attempt.forPayload({ ...payload, notes: 'edited' }), first);
  attempt.reset();
  assert.notEqual(attempt.forPayload(payload), first);
});

test('product query preserves search/sort across branches and supports pages beyond 500 products', () => {
  const query = productsQuery({ branchId: 'all', search: '  Denim  ', sort: 'price_desc', page: 12 });
  assert.equal(query.get('branch_id'), 'all');
  assert.equal(query.get('search'), 'Denim');
  assert.equal(query.get('sort'), 'price_desc');
  assert.equal(query.get('page'), '12');
  assert.equal(query.get('limit'), '48');
  assert.equal(productsQuery({ branchId: '', search: '', sort: 'name', page: 1 }).has('branch_id'), false);
  assert.equal(productBranchQuery({ branch_id: 7 }), '?branch_id=7');
});

test('bulk deletion uses each product branch and retains both server failures and failed request groups', async () => {
  const products = [1, 2, 3, 4].map((id) => ({ id, branch_id: id < 3 ? 10 : 20, capabilities: { delete: id !== 4 } }));
  const requests = [];
  const result = await bulkDeleteProducts(products, [1, 2, 3, 4], async (payload) => {
    requests.push(payload);
    if (payload.branch_id === 20) throw new Error('Koneksi terputus');
    return { deleted: 1, deactivated: 0, failed: [2], failures: [{ id: 2, message: 'Produk terkunci', status: 409 }] };
  });
  assert.deepEqual(requests, [{ branch_id: 10, ids: [1, 2] }, { branch_id: 20, ids: [3] }]);
  assert.deepEqual([...result.failedIds].sort(), [2, 3, 4]);
  assert.equal(result.deleted, 1);
  assert.equal(result.failures.find((failure) => failure.id === 2).message, 'Produk terkunci');
  assert.equal(result.failures.find((failure) => failure.id === 3).message, 'Koneksi terputus');
});

test('bulk deletion preserves legacy failed IDs even without detailed reasons', async () => {
  const result = await bulkDeleteProducts([{ id: 5, branch_id: 2, capabilities: { delete: true } }], [5], async () => ({ failed: [5] }));
  assert.deepEqual(result.failedIds, [5]);
  assert.ok(result.failures[0].message);
});
