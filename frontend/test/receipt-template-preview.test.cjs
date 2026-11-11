const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Modul ESM: dibaca sebagai teks lalu dieksekusi tanpa import statement.
const previewSource = read('app/lib/receipt-preview.js')
  .replace(/^export /gm, '');
const previewModule = new Function(`${previewSource}
  return { buildReceiptPreview, receiptGrid, isOn, RECEIPT_TEMPLATE_DEFAULTS, RECEIPT_SAMPLE };`)();
const { buildReceiptPreview, receiptGrid, isOn, RECEIPT_TEMPLATE_DEFAULTS, RECEIPT_SAMPLE } = previewModule;

const page = read('app/settings/receipt-template/page.js');
const shell = read('app/components/AppShell.js');
const settingsPage = read('app/settings/page.js');

test('menu Template Struk hanya ada di web (owner)', () => {
  assert.match(shell, /href: '\/settings\/receipt-template', label: 'Template Struk'/);
  assert.match(page, /Template struk thermal/);
  // Halaman lama mengarahkan ke template baru.
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

test('grid pratinjau sama dengan Android: 80 mm 64 kolom, 58 mm 42 kolom', () => {
  assert.deepEqual(receiptGrid({ printer_size: '80', receipt_font: 'b' }), { width: 64, margin: 4, inner: 56 });
  assert.deepEqual(receiptGrid({ printer_size: '58', receipt_font: 'b' }), { width: 42, margin: 3, inner: 36 });
  assert.equal(receiptGrid({ printer_size: '80', receipt_font: 'a' }).width, 48);
  assert.equal(receiptGrid({ printer_size: '58', receipt_font: 'a' }).width, 32);
  assert.equal(receiptGrid({ printer_size: '80', receipt_margin: '5' }).margin, 5);
});

test('setiap baris pratinjau selebar kertas dengan margin kiri = kanan', () => {
  for (const size of ['80', '58']) {
    const rows = buildReceiptPreview({ printer_size: size }, RECEIPT_SAMPLE);
    const { width, margin } = receiptGrid({ printer_size: size });
    assert.ok(rows.length > 10);
    for (const row of rows) {
      assert.equal(row.length, width, `baris tidak selebar ${width}: ${JSON.stringify(row)}`);
      assert.equal(row.slice(0, margin), ' '.repeat(margin));
      assert.equal(row.slice(-margin), ' '.repeat(margin));
    }
  }
});

test('pratinjau memuat semua nomor WhatsApp dan 3 baris alamat', () => {
  const rows = buildReceiptPreview(
    { store_address: 'Lantai 6 Blok B\nTanah Abang\nJakarta Pusat\nBaris empat' },
    RECEIPT_SAMPLE,
  ).map((row) => row.trim());
  assert.ok(rows.includes('WA 0813-1313-3162'));
  assert.ok(rows.includes('WA 0856-9116-6333'));
  assert.ok(rows.includes('WA 0877-6676-6769'));
  assert.ok(rows.includes('Tanah Abang'));
  assert.ok(!rows.some((row) => row.includes('Baris empat')));
});

test('toggle mematikan baris pada pratinjau', () => {
  const rows = buildReceiptPreview(
    {
      receipt_show_address: 'false',
      receipt_show_wa: 'false',
      receipt_show_cashier: 'false',
      receipt_show_payment: 'false',
      receipt_show_paid: 'false',
      receipt_show_change: 'false',
    },
    RECEIPT_SAMPLE,
  ).map((row) => row.trim());
  assert.ok(!rows.some((row) => row.startsWith('WA ')));
  assert.ok(!rows.some((row) => row.startsWith('Kasir')));
  assert.ok(!rows.some((row) => row.startsWith('Transfer')));
  assert.ok(!rows.some((row) => row.startsWith('Kembalian')));
});

test('teks judul, label, dan penutup bisa diganti', () => {
  const rows = buildReceiptPreview(
    {
      receipt_title_info: 'STRUK PENJUALAN',
      receipt_label_total: 'Jumlah',
      receipt_closing: 'Sampai jumpa',
    },
    RECEIPT_SAMPLE,
  ).map((row) => row.trim());
  assert.ok(rows.includes('STRUK PENJUALAN'));
  assert.ok(rows.some((row) => row.startsWith('Jumlah')));
  assert.ok(rows.includes('Sampai jumpa'));
  assert.ok(!rows.includes('INFORMASI TRANSAKSI'));
});

test('produk satu baris dengan qty, harga, dan jumlah', () => {
  const rows = buildReceiptPreview({}, RECEIPT_SAMPLE);
  const item = rows.find((row) => row.includes('B-05'));
  assert.ok(item.includes('6 x 90.000'));
  assert.ok(item.includes('Rp540.000'));
  assert.ok(item.trimEnd().endsWith('Rp540.000'));
});

test('default template sama dengan struk saat ini', () => {
  assert.equal(isOn(RECEIPT_TEMPLATE_DEFAULTS.receipt_show_logo), true);
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_separator, 'dash');
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_font, 'b');
  assert.equal(RECEIPT_TEMPLATE_DEFAULTS.receipt_label_total, 'Total');
});
