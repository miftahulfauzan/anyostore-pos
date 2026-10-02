const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('sidebar has a separate stock dashboard destination under inventory', () => {
  const shell = source('app/components/AppShell.js');
  const inventoryGroup = shell.match(/label: 'PRODUK & INVENTORI',[\s\S]*?\n  \},/);
  assert.ok(inventoryGroup);
  assert.match(inventoryGroup[0], /href: '\/inventory\/dashboard', label: 'Dashboard Stok'/);
  assert.match(inventoryGroup[0], /roles: \['owner', 'manager', 'admin'\]/);
});

test('sales dashboard no longer appends the stock dashboard for Owner', () => {
  const dashboard = source('app/dashboard/page.js');
  assert.doesNotMatch(dashboard, /owner_stock_dashboard &&/);
  assert.doesNotMatch(dashboard, /dashboardKey="owner_stock_dashboard"/);
});

test('separate stock dashboard supports all branches or one selected branch', () => {
  const stockDashboard = source('app/inventory/dashboard/page.js');
  assert.match(stockDashboard, /owner_stock_dashboard/);
  assert.match(stockDashboard, /warehouse_dashboard/);
  assert.match(stockDashboard, /branch_id/);
  assert.match(stockDashboard, /Semua toko dan gudang/);
});
