export const WAREHOUSE_PERIOD_OPTIONS = [
  { key: 'today', label: 'Hari ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: 'last7', label: '7 hari' },
  { key: 'last30', label: '30 hari' },
  { key: 'thisMonth', label: 'Bulan ini' },
  { key: 'previousMonth', label: 'Bulan lalu' },
];

const formatUtcDate = (date) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-');

const jakartaDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

const shiftDate = (value, days) => {
  const [year, month, day] = value.split('-').map(Number);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
};

export function getWarehousePeriodRange(period, now = new Date()) {
  const end = jakartaDate(now);
  const [year, month] = end.split('-').map(Number);

  switch (period) {
    case 'today':
      return { start: end, end };
    case 'yesterday': {
      const yesterday = shiftDate(end, -1);
      return { start: yesterday, end: yesterday };
    }
    case 'last7':
      return { start: shiftDate(end, -6), end };
    case 'last30':
      return { start: shiftDate(end, -29), end };
    case 'thisMonth':
      return { start: `${year}-${String(month).padStart(2, '0')}-01`, end };
    case 'previousMonth': {
      const previousMonthStart = new Date(Date.UTC(year, month - 2, 1));
      const previousMonthEnd = new Date(Date.UTC(year, month - 1, 0));
      return { start: formatUtcDate(previousMonthStart), end: formatUtcDate(previousMonthEnd) };
    }
    default:
      throw new RangeError(`Periode dashboard gudang tidak dikenal: ${period}`);
  }
}
