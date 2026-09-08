const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const productsRouter = require('../src/routes/products');

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
