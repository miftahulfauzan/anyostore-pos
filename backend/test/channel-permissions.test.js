const test = require('node:test');
const assert = require('node:assert/strict');
const { CHANNEL_MANAGEMENT_ROLES } = require('../src/permissions');

test('kelola saluran mutasi stok hanya untuk owner dan admin gudang', () => {
  assert.deepEqual(CHANNEL_MANAGEMENT_ROLES, ['owner', 'gudang']);
});
