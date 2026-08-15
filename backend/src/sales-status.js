// Satu-satunya definisi status transaksi yang dihitung sebagai penjualan.
// Semua query laporan WAJIB memakai konstanta ini supaya tambah status baru
// tidak terlewat di salah satu query (lihat AGENTS.md).
const SALES_STATUSES = [
  'completed',
  'partially_cancelled',
  'partially_refunded',
  'refunded',
];

// Bentuk SQL siap pakai: 'completed','partially_cancelled','partially_refunded','refunded'
const SALES_STATUSES_SQL = SALES_STATUSES.map((s) => `'${s}'`).join(',');

module.exports = { SALES_STATUSES, SALES_STATUSES_SQL };
