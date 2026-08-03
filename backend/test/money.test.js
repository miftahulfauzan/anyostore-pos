const test = require('node:test');
const assert = require('node:assert/strict');
const { money } = require('../src/money');

test('money membulatkan 1.005 dengan benar (Number.EPSILON)', () => {
  assert.equal(money(1.005), 1.01);
});

test('money mempertahankan dua desimal', () => {
  assert.equal(money(10), 10);
  assert.equal(money(10.999), 11);
});
