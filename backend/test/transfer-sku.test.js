const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTransferSku, makeTargetSku } = require('../src/transfer-sku');

test('SKU hasil clone dinormalisasi ke SKU dasar', () => {
  assert.equal(normalizeTransferSku('B4-AT67-2'), 'AT67-2');
  assert.equal(normalizeTransferSku('B5-B4-AT67-2'), 'AT67-2');
  assert.equal(normalizeTransferSku('AT67-2'), 'AT67-2');
});

test('SKU tujuan memakai satu prefix cabang tujuan', () => {
  assert.equal(makeTargetSku(5, 'B4-AT67-2'), 'B5-AT67-2');
  assert.equal(makeTargetSku(5, 'AT67-2'), 'B5-AT67-2');
});
