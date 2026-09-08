export const statusLabels = {
  completed: 'Selesai',
  pending: 'Menunggu',
  held: 'Ditahan',
  cancelled: 'Dibatalkan',
  partially_cancelled: 'Batal sebagian',
  refunded: 'Retur penuh',
  partially_refunded: 'Retur sebagian',
  approved: 'Disetujui',
  paid: 'Sudah dibayar',
};

export const paymentLabels = {
  cash: 'Tunai',
  qris: 'QRIS',
  debit: 'Debit',
  transfer: 'Transfer',
  split: 'Gabungan',
};

export const cashMovementLabels = {
  cash_in: 'Kas masuk',
  cash_out: 'Kas keluar',
  opening: 'Modal awal',
  closing: 'Penutupan kas',
};

export const labelFor = (labels, value, fallback = '—') => labels[value] || (value ? String(value) : fallback);
