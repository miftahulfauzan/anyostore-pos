const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'page.js'), 'utf8');
const stockDashboardPage = fs.readFileSync(path.join(__dirname, '..', 'app', 'inventory', 'dashboard', 'page.js'), 'utf8');
const globalStyles = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

let periodsModule;
async function loadPeriods() {
  periodsModule ||= await import('../app/dashboard/warehouse-periods.mjs');
  return periodsModule;
}

test('warehouse dashboard exposes quick periods while retaining custom dates', () => {
  assert.match(dashboardPage, /warehouse-dashboard-periods/);
  assert.match(dashboardPage, /WAREHOUSE_PERIOD_OPTIONS\.map/);
  assert.match(dashboardPage, /aria-pressed=/);
  assert.match(dashboardPage, /type="date"/);
  assert.match(dashboardPage, /Terapkan/);
});

test('stock dashboard exposes quick periods alongside its custom date range', () => {
  assert.match(stockDashboardPage, /WAREHOUSE_PERIOD_OPTIONS\.map/);
  assert.match(stockDashboardPage, /warehouse-dashboard-periods/);
  assert.match(stockDashboardPage, /aria-label="Pilih periode dashboard stok"/);
  assert.match(stockDashboardPage, /aria-pressed=/);
  assert.match(stockDashboardPage, /type="date"/);
  assert.match(stockDashboardPage, /Terapkan/);
});

test('stock dashboard date controls reflow on mobile without an inline separator', () => {
  assert.match(stockDashboardPage, /stock-dashboard-date-filter/);
  assert.match(globalStyles, /\.stock-dashboard-date-filter\s*\{[^}]*display:\s*grid/s);
  assert.match(globalStyles, /\.stock-dashboard-date-filter\s*>\s*span\s*\{\s*display:\s*none/s);
  assert.match(globalStyles, /\.stock-dashboard-date-filter\s+label\s*\{[^}]*min-width:\s*0/s);
  assert.match(globalStyles, /\.stock-dashboard-date-filter\s+input\s*\{[^}]*width:\s*100%/s);
  assert.match(globalStyles, /\.stock-dashboard-periods\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
});

test('period labels cover the common warehouse reporting windows', async () => {
  const { WAREHOUSE_PERIOD_OPTIONS } = await loadPeriods();
  assert.deepEqual(WAREHOUSE_PERIOD_OPTIONS.map(({ label }) => label), [
    'Hari ini',
    'Kemarin',
    '7 hari',
    '30 hari',
    'Bulan ini',
    'Bulan lalu',
  ]);
});

test('quick periods resolve to inclusive Jakarta calendar dates', async () => {
  const { getWarehousePeriodRange } = await loadPeriods();
  const now = new Date('2026-10-06T08:30:00+07:00');

  assert.deepEqual(getWarehousePeriodRange('today', now), { start: '2026-10-06', end: '2026-10-06' });
  assert.deepEqual(getWarehousePeriodRange('yesterday', now), { start: '2026-10-05', end: '2026-10-05' });
  assert.deepEqual(getWarehousePeriodRange('last7', now), { start: '2026-09-30', end: '2026-10-06' });
  assert.deepEqual(getWarehousePeriodRange('last30', now), { start: '2026-09-07', end: '2026-10-06' });
  assert.deepEqual(getWarehousePeriodRange('thisMonth', now), { start: '2026-10-01', end: '2026-10-06' });
  assert.deepEqual(getWarehousePeriodRange('previousMonth', now), { start: '2026-09-01', end: '2026-09-30' });
});

test('Jakarta midnight and unsupported periods are handled explicitly', async () => {
  const { getWarehousePeriodRange } = await loadPeriods();

  assert.deepEqual(
    getWarehousePeriodRange('today', new Date('2026-10-05T17:30:00.000Z')),
    { start: '2026-10-06', end: '2026-10-06' },
  );
  assert.throws(() => getWarehousePeriodRange('quarter', new Date('2026-10-06T08:30:00+07:00')), RangeError);
});
