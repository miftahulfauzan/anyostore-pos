const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeChannelValue } = require('../src/channel-value');

test('channel value falls back to the display name', () => {
  assert.equal(normalizeChannelValue('', 'Penjualan Offline'), 'penjualan_offline');
});

test('channel value is safe for the database column', () => {
  const value = normalizeChannelValue('', 'Marketplace Online Dengan Nama Panjang');
  assert.match(value, /^[a-z0-9_]+$/);
  assert.ok(value.length <= 30);
});
