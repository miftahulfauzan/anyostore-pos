const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let helpers;
async function loadHelpers() {
  helpers ||= await import('../app/inventory/mutation-report/chart-data.mjs');
  return helpers;
}

test('chart fills missing days with zero without shifting Jakarta dates', async () => {
  const { buildMovementChart } = await loadHelpers();
  assert.deepEqual(buildMovementChart(
    [{ date: '2026-10-12', total_qty: 7 }], '2026-10-11', '2026-10-13',
  ), {
    intervalDays: 1,
    points: [
      { date: '2026-10-11', total_qty: 0 },
      { date: '2026-10-12', total_qty: 7 },
      { date: '2026-10-13', total_qty: 0 },
    ],
  });
});

test('chart handles one day and invalid ranges', async () => {
  const { buildMovementChart } = await loadHelpers();
  assert.deepEqual(buildMovementChart([{ date: '2026-10-12', total_qty: 3 }], '2026-10-12', '2026-10-12').points,
    [{ date: '2026-10-12', total_qty: 3 }]);
  assert.deepEqual(buildMovementChart([], '2026-10-13', '2026-10-12').points, []);
  assert.deepEqual(buildMovementChart([], 'bad-date', '2026-10-12').points, []);
});

test('long custom ranges are bucketed rather than rendering hundreds of labels', async () => {
  const { buildMovementChart } = await loadHelpers();
  const chart = buildMovementChart([{ date: '2026-01-02', total_qty: 2 }], '2026-01-01', '2026-04-30');
  assert.equal(chart.intervalDays, 2);
  assert.equal(chart.points.length, 60);
  assert.deepEqual(chart.points[0], { date: '2026-01-01', total_qty: 2 });
});

test('report presents real filtered insights with loading and empty states', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'inventory', 'mutation-report', 'page.js'), 'utf8');
  const component = fs.readFileSync(path.join(__dirname, '..', 'app', 'inventory', 'mutation-report', 'MutationReportInsights.js'), 'utf8');
  assert.match(page, /setDaily\(b\.daily \|\| \[\]\)/);
  assert.match(page, /setTopProducts\(b\.top_products \|\| \[\]\)/);
  assert.match(page, /<MutationReportInsights/);
  assert.match(component, /Pergerakan barang/);
  assert.match(component, /Produk .* terbanyak/);
  assert.match(component, /loading/);
  assert.match(component, /Belum ada/);
  assert.match(component, /aria-label=/);
});
