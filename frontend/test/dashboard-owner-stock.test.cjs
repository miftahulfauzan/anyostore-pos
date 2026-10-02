const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'page.js'), 'utf8');
const dashboardRoute = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'routes', 'dashboard.js'), 'utf8');

test('dashboard penjualan tetap terpisah dari dashboard stok', () => {
  assert.doesNotMatch(dashboardPage, /owner_stock_dashboard/);
  assert.match(dashboardPage, /const isGudang = role === 'gudang'/);
});

test('endpoint menyiapkan data stok untuk Owner dan role pengelola cabang', () => {
  assert.match(dashboardRoute, /\['gudang', 'owner', 'manager', 'admin'\]\.includes\(req\.user\.role\)/);
  assert.match(dashboardRoute, /ownerStockDashboard = warehouseDashboard/);
  assert.match(dashboardRoute, /owner_stock_dashboard: ownerStockDashboard/);
  assert.match(dashboardRoute, /stockDashboardScope\(/);
  assert.match(dashboardRoute, /queryBranchId: req\.query\.branch_id/);
});
