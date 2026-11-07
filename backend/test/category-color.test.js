const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCategoryColor } = require('../src/category-color');

test('normalizes a valid category color to uppercase hex', () => {
  assert.equal(normalizeCategoryColor('  #aBc123  '), '#ABC123');
});

test('treats missing or blank category color as null', () => {
  assert.equal(normalizeCategoryColor(undefined), null);
  assert.equal(normalizeCategoryColor(null), null);
  assert.equal(normalizeCategoryColor('  '), null);
});

test('rejects category colors that are not six-digit hex', () => {
  assert.throws(
    () => normalizeCategoryColor('#12345'),
    error => error.status === 400 && error.message === 'Warna kategori tidak valid',
  );
  assert.throws(
    () => normalizeCategoryColor('red; DROP TABLE categories'),
    error => error.status === 400 && error.message === 'Warna kategori tidak valid',
  );
});
