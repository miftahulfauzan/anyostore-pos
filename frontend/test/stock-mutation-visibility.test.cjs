const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appShell = fs.readFileSync(path.join(root, 'app/components/AppShell.js'), 'utf8');
const mutationPage = fs.readFileSync(path.join(root, 'app/inventory/mutations/page.js'), 'utf8');
const warehouseDashboard = fs.readFileSync(path.join(root, 'app/dashboard/WarehouseDashboard.js'), 'utf8');
const stockDashboard = fs.readFileSync(path.join(root, 'app/inventory/dashboard/page.js'), 'utf8');

test('web sidebar exposes stock incoming/outgoing only to owner and gudang', () => {
  assert.match(appShell, /href: '\/inventory\/incoming', label: 'Stok Masuk'[^\n]*roles: \['owner', 'gudang'\]/);
  assert.match(appShell, /href: '\/inventory\/outgoing', label: 'Stok Keluar'[^\n]*roles: \['owner', 'gudang'\]/);
});

test('web mutation page blocks direct access for non-allowed roles', () => {
  assert.match(mutationPage, /\['owner', 'gudang'\]\.includes\(user\?\.role\)/);
  assert.match(mutationPage, /router\.replace\('\/inventory'\)/);
  assert.match(mutationPage, /Akses mutasi stok dibatasi/);
});

test('stock dashboard quick actions use the same mutation permission', () => {
  assert.match(warehouseDashboard, /canMutateStock/);
  assert.match(stockDashboard, /canMutateStock=\{role === 'owner' \|\| role === 'gudang'\}/);
});
