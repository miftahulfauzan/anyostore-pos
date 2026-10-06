const test = require('node:test');
const assert = require('node:assert/strict');
const { dateRangeDays, subscribeDashboardRefresh } = require('../app/dashboard/stock-movement.cjs');

test('incoming and outgoing yesterday stay on the WIB date after JSON serialization', () => {
  const daily = [{ date: '2026-10-04T17:00:00.000Z', in: 20, out: 8 }];
  const rows = dateRangeDays('2026-10-04', '2026-10-06', daily);
  assert.deepEqual(rows, [
    { date: '2026-10-04', in: 0, out: 0 },
    { date: '2026-10-05', in: 20, out: 8 },
    { date: '2026-10-06', in: 0, out: 0 },
  ]);
});

test('date-only API values and first/last-day movement totals survive filling missing dates', () => {
  const rows = dateRangeDays('2026-09-30', '2026-10-06', [
    { date: '2026-09-30', in: 12, out: 3 },
    { date: '2026-10-06', in: 20, out: 8 },
  ]);
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((sum, row) => sum + row.in, 0), 32);
  assert.equal(rows.reduce((sum, row) => sum + row.out, 0), 11);
});

test('custom periods longer than 62 days retain their last-day stock activity', () => {
  const rows = dateRangeDays('2026-07-01', '2026-10-06', [{ date: '2026-10-06', in: 15, out: 7 }]);
  assert.equal(rows.length, 98);
  assert.deepEqual(rows.at(-1), { date: '2026-10-06', in: 15, out: 7 });
});

test('empty periods, malformed dates, leap days and Date objects are handled safely', () => {
  assert.deepEqual(dateRangeDays('', '', null), []);
  assert.deepEqual(dateRangeDays('2026-10-06', '2026-10-05', []), []);
  assert.deepEqual(dateRangeDays('invalid', '2026-10-06', []), []);
  const rows = dateRangeDays('2024-02-28', '2024-03-01', [
    { date: new Date('2024-02-29T00:00:00+07:00'), in: '4', out: '2' },
    { date: 'invalid', in: 100, out: 100 },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], { date: '2024-02-29', in: 4, out: 2 });
});

test('dashboard refreshes while visible and on return to the tab, and unsubscribes on unmount', () => {
  const browser = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  let tick;
  let cleared = false;
  browser.setInterval = (callback, delay) => { tick = callback; assert.equal(delay, 60000); return 1; };
  browser.clearInterval = (id) => { assert.equal(id, 1); cleared = true; };
  let refreshes = 0;
  const cleanup = subscribeDashboardRefresh(() => { refreshes += 1; }, browser, document);
  tick();
  assert.equal(refreshes, 1);
  document.visibilityState = 'hidden';
  tick();
  browser.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 1);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 3);
  cleanup();
  browser.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 3);
  assert.equal(cleared, true);
});
