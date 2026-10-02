const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'inventory', 'opname', 'page.js'), 'utf8');

test('Owner loads active warehouses across branches and can identify each target', () => {
  assert.match(source, /inventory\/warehouses\/all/);
  assert.match(source, /branch_name/);
  assert.match(source, /role === 'owner'/);
});

test('non-owner opname warehouse loading remains branch-scoped', () => {
  assert.match(source, /const endpoint = isOwner \? '\/inventory\/warehouses\/all' : '\/inventory\/warehouses'/);
  assert.match(source, /const isOwner = user\.role === 'owner'/);
});

test('changing the selected warehouse reloads its stock and history', () => {
  assert.match(source, /function changeWarehouse/);
  assert.match(source, /load\(warehouse, \{ signal: controller\.signal \}\)/);
  assert.match(source, /loadHistory\(warehouse\)/);
  assert.match(source, /payload\.branch_id = Number\(selectedWarehouse\.branch_id\)/);
});
