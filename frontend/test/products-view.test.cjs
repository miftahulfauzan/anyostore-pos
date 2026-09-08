const test = require('node:test');
const assert = require('node:assert/strict');
const { getProductSelectionPlacement } = require('../app/products/view-utils.cjs');

test('mode Grid menempatkan checkbox di atas thumbnail', () => {
  assert.equal(getProductSelectionPlacement('grid'), 'thumbnail');
});

test('mode Daftar menempatkan checkbox di kolom terpisah', () => {
  assert.equal(getProductSelectionPlacement('list'), 'column');
});

test('mode tidak dikenal aman memakai kolom terpisah', () => {
  assert.equal(getProductSelectionPlacement('unknown'), 'column');
});
