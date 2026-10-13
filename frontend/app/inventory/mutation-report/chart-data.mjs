const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_POINTS = 60;

function dateMillis(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const millis = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
}

export function buildMovementChart(daily, start, end) {
  const first = dateMillis(start);
  const last = dateMillis(end);
  if (first === null || last === null || first > last) return { intervalDays: 1, points: [] };

  const dayCount = Math.round((last - first) / DAY_MS) + 1;
  const intervalDays = Math.max(1, Math.ceil(dayCount / MAX_POINTS));
  const points = Array.from({ length: Math.ceil(dayCount / intervalDays) }, (_, index) => ({
    date: new Date(first + index * intervalDays * DAY_MS).toISOString().slice(0, 10),
    total_qty: 0,
  }));

  for (const row of Array.isArray(daily) ? daily : []) {
    const day = dateMillis(row?.date);
    const qty = Number(row?.total_qty);
    if (day === null || day < first || day > last || !Number.isFinite(qty)) continue;
    points[Math.floor((day - first) / DAY_MS / intervalDays)].total_qty += qty;
  }

  return { intervalDays, points };
}
