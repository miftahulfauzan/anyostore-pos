#!/usr/bin/env node
// Menulis ulang fixture golden untuk aturan struk.
//
// Jalankan HANYA setelah sengaja mengubah aturan struk:
//   node scripts/generate-receipt-fixtures.js
// lalu tinjau diff-nya. Fixture yang sama dipakai test backend DAN test Flutter
// (mobile/test/receipt_lines_golden_test.dart), jadi perubahan di sini berarti
// kedua implementasi harus ikut berubah.
const fs = require('fs');
const path = require('path');
const { buildReceipt } = require('../src/receipt-lines');

const dir = path.join(__dirname, '..', 'test', 'fixtures', 'receipt-lines');

const store80 = {
  printer_size: '80',
  receipt_font: 'b',
  receipt_margin: '4',
  store_name: 'ANYOSTORE METRO',
  store_address: 'Jl. Gatot Subroto No. 12\nMetro Lampung',
  store_phone: '0812-3456-7890',
  whatsapp_numbers: '["0812-3456-7890","0857-1111-2222","0821-3333-4444"]',
  receipt_header: 'Terima kasih telah berbelanja',
  store_tax_id: '01.234.567.8-901.000',
  receipt_title_info: 'INFORMASI TRANSAKSI',
  receipt_title_products: 'PRODUK',
  receipt_closing: 'Terima kasih, sampai jumpa lagi!',
  receipt_footer: 'Barang yang sudah dibeli tidak dapat ditukar',
  receipt_separator: 'dash',
  receipt_show_address: 'true',
  receipt_show_wa: 'true',
  receipt_show_npwp: 'true',
  receipt_show_cashier: 'true',
  receipt_show_customer: 'true',
  receipt_show_payment: 'true',
  receipt_show_paid: 'true',
  receipt_show_change: 'true',
};

const baseReceipt = {
  store: store80,
  invoice_no: 'INV-20261113-B1-0007',
  created_at: '2026-11-13T03:21:00.000Z',
  transaction_date: '2026-11-13',
  cashier: 'Siti',
  customer_name: 'Rina',
  items: [
    { name: 'Celana Denim Baggy High Waist', quantity: 3, price: 145000, subtotal: 435000 },
    { name: 'Jaket Denim Oversize', quantity: 1, price: 210000, subtotal: 210000 },
    { name: 'Rok Denim A Line', quantity: 2, price: 98000, subtotal: 196000 },
  ],
  subtotal: 841000,
  discount: 41000,
  grand_total: 800000,
  payments: [
    { payment_method: 'cash', amount: 500000 },
    { payment_method: 'qris', amount: 300000 },
  ],
  amount_paid: 800000,
  change: 0,
};

const cases = [
  {
    file: '80mm-fontb-lengkap.json',
    description: 'Kertas 80mm Font B, semua toggle aktif, dua metode bayar.',
    receipt: baseReceipt,
  },
  {
    file: '58mm-fonta.json',
    description: 'Kertas 58mm dengan Font A (32 kolom, margin 3).',
    receipt: {
      ...baseReceipt,
      store: { ...store80, printer_size: '58mm', receipt_font: 'a', receipt_margin: '' },
    },
  },
  {
    file: 'toggle-mati.json',
    description: 'Semua toggle identitas/kasir/pelanggan/pembayaran dimatikan.',
    receipt: {
      ...baseReceipt,
      store: {
        ...store80,
        receipt_show_address: 'false',
        receipt_show_wa: 'false',
        receipt_show_npwp: 'false',
        receipt_show_cashier: 'false',
        receipt_show_customer: 'false',
        receipt_show_payment: 'false',
        receipt_show_paid: 'false',
        receipt_show_change: 'false',
      },
    },
  },
  {
    file: 'separator-none.json',
    description: 'Pemisah garis dimatikan (receipt_separator=none).',
    receipt: { ...baseReceipt, store: { ...store80, receipt_separator: 'none' } },
  },
  {
    file: 'separator-blank.json',
    description: 'Pemisah berupa baris kosong (receipt_separator=blank).',
    receipt: { ...baseReceipt, store: { ...store80, receipt_separator: 'blank' } },
  },
  {
    file: 'nama-panjang.json',
    description: 'Nama produk, nama toko, dan alamat panjang; margin 6.',
    receipt: {
      ...baseReceipt,
      invoice_no: 'INV-20261113-B1-0008',
      items: [
        { name: 'Celana Denim Baggy High Waist Premium Stretch', quantity: 12, price: 145000, subtotal: 1740000 },
        { name: 'Kemeja Denim Lengan Panjang Bordir Bunga', quantity: 1, price: 210000, subtotal: 210000 },
      ],
      subtotal: 1950000,
      discount: 0,
      grand_total: 1950000,
      amount_paid: 2000000,
      change: 50000,
      payments: [{ payment_method: 'cash', amount: 2000000 }],
      store: {
        ...store80,
        receipt_margin: '6',
        store_name: 'ANYOSTORE TOKO BLOK B TANAH ABANG JAKARTA PUSAT',
        store_address: 'Blok B lantai LG los F no 107\nTanah Abang\nJakarta Pusat\nBaris keempat tidak tercetak',
      },
    },
  },
  {
    file: 'tanpa-diskon-tanpa-pelanggan.json',
    description: 'Tanpa diskon, tanpa pelanggan, satu metode bayar tanpa array payments.',
    receipt: {
      store: store80,
      invoice_no: 'INV-20261113-B2-0003',
      created_at: '2026-11-13T09:05:00.000Z',
      transaction_date: '2026-11-13',
      cashier: 'Ani',
      customer_name: '',
      items: [{ name: 'A104', quantity: 4, price: 95000, subtotal: 380000 }],
      subtotal: 380000,
      discount: 0,
      grand_total: 380000,
      payment_method: 'cash',
      amount_paid: 400000,
      change: 20000,
    },
  },
  {
    file: 'bayar-terpisah.json',
    description: 'Tiga metode bayar (split) dan kembalian nol.',
    receipt: {
      ...baseReceipt,
      payments: [
        { payment_method: 'cash', amount: 200000 },
        { payment_method: 'transfer', amount: 300000 },
        { payment_method: 'debit', amount: 300000 },
      ],
      amount_paid: 800000,
      change: 0,
    },
  },
  {
    file: 'karakter-non-ascii.json',
    description: 'Karakter non-ASCII disanitasi ke bentuk ASCII aman printer.',
    receipt: {
      ...baseReceipt,
      customer_name: 'Ibu Rina \u2018grosir\u2019',
      items: [{ name: 'Celana \u00b7 Baggy \u2013 3 pcs \u00d7 1', quantity: 1, price: 145000, subtotal: 145000 }],
      subtotal: 145000,
      discount: 0,
      grand_total: 145000,
      amount_paid: 145000,
      change: 0,
      payments: [{ payment_method: 'qris', amount: 145000 }],
    },
  },
  {
    file: 'invoice-offline-sementara.json',
    description: 'Struk transaksi offline: nomor sementara OFF-, tunai, tanpa created_at.',
    receipt: {
      store: store80,
      invoice_no: 'OFF-1-1731498000000',
      transaction_date: '2026-11-13',
      cashier: 'Siti',
      customer_name: 'Umum',
      items: [{ name: 'Celana Baggy A104', quantity: 2, price: 145000, subtotal: 290000 }],
      subtotal: 290000,
      discount: 0,
      grand_total: 290000,
      payment_method: 'cash',
      amount_paid: 300000,
      change: 10000,
    },
  },
  {
    file: 'label-kustom.json',
    description: 'Judul dan label diubah per cabang lewat template struk.',
    receipt: {
      ...baseReceipt,
      store: {
        ...store80,
        receipt_title_info: 'NOTA PENJUALAN',
        receipt_title_products: 'DAFTAR BARANG',
        receipt_label_invoice: 'No. Nota',
        receipt_label_date: 'Waktu',
        receipt_label_cashier: 'Petugas',
        receipt_label_customer: 'Pembeli',
        receipt_label_subtotal: 'Jumlah',
        receipt_label_discount: 'Potongan',
        receipt_label_total: 'Total Bayar',
        receipt_label_paid: 'Diterima',
        receipt_label_change: 'Sisa',
        receipt_closing: 'Terima kasih sudah belanja di Anyostore',
      },
    },
  },
];

fs.mkdirSync(dir, { recursive: true });
for (const item of cases) {
  const expected = buildReceipt(item.receipt);
  const payload = {
    description: item.description,
    receipt: item.receipt,
    expected: {
      width: expected.width,
      margin: expected.margin,
      font: expected.font,
      inner: expected.inner,
      lines: expected.lines,
    },
  };
  fs.writeFileSync(path.join(dir, item.file), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${item.file} (${expected.lines.length} baris)`);
}