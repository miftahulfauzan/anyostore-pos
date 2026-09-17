const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'page.js'), 'utf8');
const dashboardRoute = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'routes', 'dashboard.js'), 'utf8');

test('dashboard Owner merender dashboard stok tanpa mengganti dashboard penjualan', () => {
  assert.match(dashboardPage, /owner_stock_dashboard/);
  assert.match(dashboardPage, /dashboardKey="owner_stock_dashboard"/);
  assert.match(dashboardPage, /role !== 'owner' && Boolean\(data\?\.warehouse_dashboard\)/);
});

test('endpoint dashboard menghitung stok untuk Owner dan seluruh cabang aktif', () => {
  assert.match(dashboardRoute, /const includeStockDashboard = req\.user\.role === 'gudang' \|\| owner/);
  assert.match(dashboardRoute, /ownerStockDashboard = warehouseDashboard/);
  assert.match(dashboardRoute, /owner_stock_dashboard: ownerStockDashboard/);
  assert.match(dashboardRoute, /const stockBranchFilter = req\.user\.role === 'gudang' \? " AND b\.type = 'gudang'" : ''/);
});
