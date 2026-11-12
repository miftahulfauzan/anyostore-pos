// Default template struk + data contoh untuk pratinjau.
//
// Aturan penyusunan baris TIDAK ada di sini: semuanya dikerjakan server
// (backend/src/receipt-lines.js) lewat POST /api/printer/preview, supaya
// pratinjau, cetak thermal Android, dan halaman resi memakai aturan yang sama.

export const RECEIPT_TEMPLATE_DEFAULTS = {
  store_name: 'BASIK PGMTA',
  receipt_header: 'Terima kasih telah berbelanja',
  receipt_note: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
  receipt_footer: '',
  receipt_closing: 'Terima kasih, sampai jumpa lagi!',
  receipt_title_info: 'INFORMASI TRANSAKSI',
  receipt_title_products: 'PRODUK',
  receipt_label_invoice: 'Invoice',
  receipt_label_date: 'Tanggal',
  receipt_label_cashier: 'Kasir',
  receipt_label_customer: 'Pelanggan',
  receipt_label_subtotal: 'Subtotal',
  receipt_label_discount: 'Diskon',
  receipt_label_total: 'Total',
  receipt_label_paid: 'Dibayar',
  receipt_label_change: 'Kembalian',
  receipt_show_logo: 'true',
  receipt_show_address: 'true',
  receipt_show_wa: 'true',
  receipt_show_npwp: 'true',
  receipt_show_cashier: 'true',
  receipt_show_customer: 'true',
  receipt_show_payment: 'true',
  receipt_show_paid: 'true',
  receipt_show_change: 'true',
  receipt_separator: 'dash',
  receipt_font: 'b',
  receipt_margin: '',
  printer_size: '80',
};

export const isOn = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
};

/** Data contoh untuk pratinjau; bentuknya sama dengan payload struk server. */
export const RECEIPT_SAMPLE = {
  invoice_no: 'INV-20261110-B1-0008',
  transaction_date: '2026-11-10',
  created_at: '2026-11-10T07:12:00.000Z',
  cashier: 'Anyostore',
  customer_name: 'Umum',
  items: [
    { name: 'B-05', quantity: 6, price: 90000, subtotal: 540000 },
    { name: 'A101-BLAZE', quantity: 8, price: 100000, subtotal: 800000 },
    { name: 'A102 BORDIR', quantity: 12, price: 95000, subtotal: 1140000 },
  ],
  subtotal: 2480000,
  discount: 0,
  grand_total: 2480000,
  payments: [{ payment_method: 'cash', amount: 2480000 }],
  amount_paid: 2480000,
  change: 0,
};