/* global __dirname */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'app', file), 'utf8');

test('Owner gets one shared store switcher in the app header with desktop and mobile interaction modes', () => {
  const shell = read('components/AppShell.js');
  const switcher = read('components/BranchSwitcher.js');
  const provider = read('components/AppStateProvider.js');
  assert.match(shell, /<BranchSwitcher\s*\/>/);
  assert.match(switcher, /user\?\.role !== 'owner'/);
  assert.match(switcher, /Semua Toko\/Gudang/);
  assert.match(switcher, /aria-modal="true"/);
  assert.match(switcher, /requestActiveBranchChange/);
  assert.match(provider, /hasUnsavedWork\(\) && !window\.confirm/);
  assert.match(provider, /event\.key !== 'pos_active_branch_id'/);
});

test('latest store or warehouse selection wins when earlier data requests finish late', () => {
  const pos = read('pos/page.js');
  const mutations = read('inventory/mutations/page.js');
  const transfers = read('inventory/transfers/page.js');
  const opname = read('inventory/opname/page.js');
  const dashboard = read('dashboard/page.js');
  const reports = read('reports/page.js');
  for (const source of [pos, mutations, transfers, opname, dashboard, reports]) {
    assert.match(source, /createRequestSequence/);
    assert.match(source, /\.isCurrent\(/);
  }
  assert.match(opname, /historyRequestSequence/);
  assert.match(transfers, /historyLoadSequence/);
});

test('business dashboard and stock dashboard both fetch using the shared branch context', () => {
  const business = read('dashboard/page.js');
  const stock = read('inventory/dashboard/page.js');
  assert.match(business, /activeBranchId/);
  assert.match(business, /query\.set\('branch_id', activeBranchId\)/);
  assert.match(stock, /activeBranchId/);
  assert.doesNotMatch(stock, /useState\('all'\)/);
  assert.doesNotMatch(stock, /stock-dashboard-branch/);
  assert.match(read('pos/page.js'), /user\?\.role !== 'owner' && <label htmlFor="pos-store-select"/);
});

test('Owner opname requires an explicit branch and warehouse before loading stock', () => {
  const opname = read('inventory/opname/page.js');
  assert.match(opname, /branch_id/);
  assert.match(opname, /Pilih toko terlebih dahulu/);
  assert.match(opname, /Pilih gudang/);
  assert.match(opname, /activeBranchId/);
  assert.match(opname, /!warehouse/);
  assert.match(opname, /requestActiveBranchChange/);
  assert.match(opname, /visibleWarehouses/);
});

test('inventory history and transfer history follow the selected Owner branch context', () => {
  const movements = read('inventory/movements/page.js');
  const transfers = read('inventory/transfers/page.js');
  assert.match(movements, /query\.set\('branch_id', activeBranchId\)/);
  assert.match(movements, /\[user\?\.role, activeBranchId\]/);
  assert.match(transfers, /params\.set\('branch_id', activeBranchId\)/);
  assert.match(transfers, /\[user\?\.role, activeBranchId\]/);
});

test('dark mode uses shared readable semantic tokens across app surfaces and controls', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');
  assert.match(css, /--surface-primary/);
  assert.match(css, /--text-primary/);
  assert.match(css, /\.dark \.app-main/);
  assert.match(css, /\.dark \.app-main :where\(input/);
  assert.match(css, /\.dark \.app-main :where\(\.panel/);
  assert.match(css, /\[style\*="color: #0f172a"\]/);
  assert.match(css, /\[style\*="color: #64748b"\]/);
  assert.match(css, /\[style\*="color: #1e3a5f"\]/);
  assert.match(css, /\[style\*="background: #ffffff"\]/);
});
