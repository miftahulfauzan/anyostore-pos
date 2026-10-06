const wibDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
});

function movementDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : wibDate.format(date);
}

function dateRangeDays(start, end, daily) {
  const byDate = new Map((daily || []).map((item) => [movementDate(item.date), item]));
  if (!start || !end) return daily || [];
  const rows = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    const item = byDate.get(key);
    rows.push({ date: key, in: Number(item?.in || 0), out: Number(item?.out || 0) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function subscribeDashboardRefresh(refresh, browser, document) {
  const refreshVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const timer = browser.setInterval(refreshVisible, 60000);
  browser.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  return () => {
    browser.clearInterval(timer);
    browser.removeEventListener('focus', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
  };
}

module.exports = { dateRangeDays, subscribeDashboardRefresh };
