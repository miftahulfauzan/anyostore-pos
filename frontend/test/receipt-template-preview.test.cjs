const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Aturan struk hanya ada di backend; test web memakai modul yang sama supaya
// pratinjau, halaman resi, dan cetak Android tidak bisa berbeda diam-diam.
const { buildReceipt, receiptLayout } = require('../../backend/src/receipt-lines');
const { RECEIPT_SAMPLE, RECEIPT_TEMPLATE_DEFAULTS, isOn } = require('./helpers/receipt-template-module')();

const page = read('app/settings/receipt-template/page.js');
const storeSettings = read('app/store-settings/page.js');
const receiptPage = read('app/receipt/[id]/page.js');
const shell = read('app/components/AppShell.js');
const settingsPage = read('app/settings/page.js');

const rowsFor = (settings = {}) => buildReceipt({
  ...RECEIPT_SAMPLE,
  store: { ...RECEIPT_TEMPLATE_DEFAULTS, ...settings },
}).lines;

test('menu Template Struk hanya ada di web (owner)', () => {
  assert.match(shell, /href: '\/store-settings', label: 'Setelan Toko'/);
  assert.match(storeSettings, /Template struk/);
  assert.match(page, /Template struk thermal/);
  assert.match(settingsPage, /settings\/receipt-template/);
});

test('setelan template disimpan per cabang lewat PUT /settings', () => {
  assert.match(page, /branch_id: Number\(branch\)/);
  assert.match(page, /method: 'PUT'/);
  assert.match(page, /receipt_title_info/);
  assert.match(page, /receipt_separator/);
  assert.match(page, /receipt_font/);
  assert.match(page, /receipt_margin/);
});

test('pratinjau & halaman resi disusun server, bukan di browser', () => {
  for (const source of [page, storeSettings]) {
    assert.match(source, /\/printer\/preview/);
    assert.doesNotMatch(source, /buildReceiptPreview/);
  }
  assert.equal(fs.existsSync(path.join(root, 'app/lib/receipt-preview.js')), false, 'implementasi pratinjau di browser sudah dihapus');
  // Halaman resi hanya mencetak baris kiriman server.
  assert.match(receiptPage, /data\.lines/);
  assert.match(receiptPage, /receipt-line/);
  assert.doesNotMatch(receiptPage, /receipt-product-list/);
});

test('grid pratinjau sama dengan Android: 80 mm 64 kolom, 58 mm 42 kolom', () => {
  assert.deepEqual(receiptLayout({ store: { printer_size: '80', receipt_font: 'b' } }), { width: 64, margin: 4, font: 'b', inner: 56 });
  assert.deepEqual(receiptLayout({ store: { printer_size: '58', receipt_font: 'b' } }), { width: 42, margin: 3, font: 'b', inner: 36 });
  assert.equal(receiptLayout({ store: { printer_size: '80', receipt_font: 'a' } }).width, 48);
  assert.equal(receiptLayout({ store: { printer_size: '58', receipt_font: 'a' } }).width, 32);
  assert.equal(receiptLayout({ store: { printer_size: '80', receipt_margin: '5' } }).margin, 5);
});

test('setiap baris pratinjau selebar kertas dengan margin kiri = kanan', () => {
  for (const size of ['80', '58']) {
    const { width, margin } = receiptLayout({ store: { printer_size: size } });
    const rows = rowsFor({ printer_size: size });
    assert.ok(rows.length > 10);
    for (const row of rows) {
      assert.equal(row.text.length, width, `baris tidak selebar ${width}: ${JSON.stringify(row.text)}`);
      assert.equal(row.text.slice(0, margin), ' '.repeat(margin));
      assert.equal(row.text.slice(-margin), ' '.repeat(margin));
    }
  }
});

test('pratinjau memuat semua nomor WhatsApp dan 3 baris alamat', () => {
  const rows = rowsFor({
    store_address: 'Lantai 6 Blok B\nTanah Abang\nJakarta Pusat\nBaris empat',
    store_phone: '0813-1313-3162',
    whatsapp_numbers: '["0813-1313-3162","0856-9116-6333","0877-6676-6769"]',
  }).map((row) => row.text.trim());
  assert.ok(rows.includes('WhatsApp'));
  assert.ok(rows.includes('0813-1313-3162'));
  assert.ok(rows.includes('0856-9116-6333'));
  assert.ok(rows.includes('0877-6676-6769'));
  assert.ok(rows.includes('Tanah Abang'));
  assert.ok(!rows.some((row) => row.includes('Baris empat')));
});

test('toggle mematikan baris pada pratinjau', () => {
  const rows = rowsFor({
    receipt_show_address: 'false',
    receipt_show_wa: 'false',
    receipt_show_cashier: 'false',
    receipt_show_payment: 'false',
    receipt_show_paid: 'false',
    receipt_show_change: 'false',
  }).map((row) => row.text.trim());
  assert.ok(!rows.includes('WhatsApp'));
  assert.ok(!rows.some((row) => row.startsWith('Kasir')));
  assert.ok(!rows.some((row) => row.startsWith('Tunai')));
  assert.ok(!rows.some((row) => row.startsWith('Kembalian')));
});

test('teks judul, label, dan penutup bisa diganti', () => {
  const rows = rowsFor({
    receipt_title_info: 'STRUK PENJUALAN',
    receipt_label_total: 'Jumlah',
    receipt_closing: 'Sampai jumpa',
  }).map((row) => row.text.trim());
  assert.ok(rows.includes('STRUK PENJUALAN'));
  assert.ok(rows.some((row) => row.startsWith('Jumlah')));
  assert.ok(rows.includes('Sampai jumpa'));
  assert.ok(!rows.includes('INFORMASI TRANSAKSI'));
});

test('produk satu baris dengan qty, harga, dan jumlah', () => {
  const row = rowsFor({}).find((line) => line.text.includes('B-05'));
  assert.ok(row);
  assert.match(row.text, /6 x 90\.000/);
  assert.match(row.text, /Rp540\.000/);
  assert.ok(row.text.trimEnd().endsWith('Rp540.000'));
});

test('default template sama dengan struk saat ini', () => {
  assert.equal(isOn(RECEIPT_TEMPLATE_DEFAULTS.receipt_show_logo), true);
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_separator, 'dash');
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_font, 'b');
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_label_total, 'Total');
});