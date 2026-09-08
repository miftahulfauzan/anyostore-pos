const test = require('node:test');
const assert = require('node:assert/strict');
const { CHANNEL_MANAGEMENT_ROLES } = require('../src/permissions');

test('admin gudang memiliki akses kelola saluran mutasi stok', () => {
  assert.deepEqual(CHANNEL_MANAGEMENT_ROLES, ['owner', 'manager', 'admin', 'gudang']);
});
