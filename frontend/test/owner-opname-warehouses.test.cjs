/* global __dirname */

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
  assert.match(source, /const isOwner = role === 'owner'/);
  assert.match(source, /user\?\.role/);
});

test('changing the selected warehouse reloads its stock and history', () => {
  assert.match(source, /function changeWarehouse/);
  assert.match(source, /load\(warehouse, \{ signal: controller\.signal \}\)/);
  assert.match(source, /loadHistory\(warehouse\)/);
  assert.match(source, /payload\.branch_id = Number\(selectedWarehouse\.branch_id\)/);
});

test('Owner selects a branch before warehouses and stock are exposed', () => {
  assert.match(source, /const visibleWarehouses = useMemo\(\(\) => isOwner/);
  assert.match(source, /disabled=\{isOwner && !branchId\}/);
  assert.match(source, /\(isOwner && !branchId\)/);
  assert.match(source, /value=\{branchId \|\| \(activeBranchId === 'all' \? 'all' : ''\)\}/);
  assert.match(source, /value="all">Semua toko\/gudang \(pilih satu lokasi untuk opname\)/);
  assert.match(source, /if \(!id \|\| !requestActiveBranchChange\(id\)\) return/);
});
