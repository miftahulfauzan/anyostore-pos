const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildReceipt, buildReceiptLines, receiptLayout } = require('../src/receipt-lines');
const { attachReceiptLines } = require('../src/receipt-data');

const fixtureDir = path.join(__dirname, 'fixtures', 'receipt-lines');
const fixtures = fs.readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ file, ...JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8')) }));

test('semua fixture golden cocok dengan aturan server', () => {
  assert.ok(fixtures.length >= 10, 'fixture golden struk harus lengkap');
  for (const fixture of fixtures) {
    assert.deepEqual(buildReceipt(fixture.receipt), fixture.expected, `${fixture.file} berbeda dari golden`);
  }
});

test('setiap baris struk selebar kertas (tidak ada baris melipat di printer)', () => {
  for (const fixture of fixtures) {
    const { width, lines } = fixture.expected;
    lines.forEach((line, index) => {
      assert.equal(line.text.length, width, `${fixture.file} baris ${index} lebarnya ${line.text.length}, harus ${width}`);
      assert.ok(['left', 'center'].includes(line.alignment));
      assert.equal(typeof line.bold, 'boolean');
    });
  }
});

test('ukuran kertas & font mengikuti setelan cabang', () => {
  assert.deepEqual(receiptLayout({ store: {} }), { width: 64, margin: 4, font: 'b', inner: 56 });
  assert.equal(receiptLayout({ store: { printer_size: '58mm' } }).width, 42);
  assert.equal(receiptLayout({ store: { printer_size: '58', receipt_font: 'a' } }).width, 32);
  assert.equal(receiptLayout({ store: { printer_size: '80', receipt_font: 'A' } }).width, 48);
  // Margin 0 / di luar 1-6 kembali ke default kertas.
  assert.equal(receiptLayout({ store: { receipt_margin: '0' } }).margin, 4);
  assert.equal(receiptLayout({ store: { receipt_margin: '9' } }).margin, 4);
  assert.equal(receiptLayout({ store: { printer_size: '58', receipt_margin: '9' } }).margin, 3);
  assert.equal(receiptLayout({ store: { receipt_margin: '2' } }).margin, 2);
});

test('setelan kosong dianggap aktif, hanya false/0 yang mematikan', () => {
  const base = {
    store: {},
    invoice_no: 'INV-1',
    cashier: 'Siti',
    customer_name: 'Rina',
    items: [{ name: 'A104', quantity: 1, price: 1000, subtotal: 1000 }],
    subtotal: 1000,
    discount: 0,
    grand_total: 1000,
    amount_paid: 1000,
    change: 0,
    payments: [{ payment_method: 'cash', amount: 1000 }],
  };
  const aktif = buildReceiptLines(base).map((line) => line.text).join('\n');
  assert.match(aktif, /Kasir/);
  assert.match(aktif, /Pelanggan/);
  assert.match(aktif, /Tunai/);
  assert.match(aktif, /Kembalian/);

  const mati = buildReceiptLines({
    ...base,
    store: { receipt_show_cashier: 'false', receipt_show_customer: '0', receipt_show_payment: 'false', receipt_show_change: '0' },
  }).map((line) => line.text).join('\n');
  assert.doesNotMatch(mati, /Kasir/);
  assert.doesNotMatch(mati, /Pelanggan/);
  assert.doesNotMatch(mati, /Tunai/);
  assert.doesNotMatch(mati, /Kembalian/);
});

test('nomor WhatsApp tidak tercetak ganda', () => {
  const receipt = {
    store: {
      whatsapp_numbers: '["0812-3456-7890","0857-1111-2222"]',
      whatsapp_number: '0812-3456-7890',
      store_phone: '0812-3456-7890',
    },
    invoice_no: 'INV-1',
    items: [],
    subtotal: 0,
    discount: 0,
    grand_total: 0,
  };
  const lines = buildReceiptLines(receipt).map((line) => line.text.trim()).filter(Boolean);
  const waIndex = lines.indexOf('WhatsApp');
  assert.ok(waIndex >= 0, 'label WhatsApp harus ada');
  assert.equal(lines.filter((line) => line === '0812-3456-7890').length, 1);
  assert.equal(lines.filter((line) => line === '0857-1111-2222').length, 1);
});

test('label dan judul kustom dari template dipakai apa adanya', () => {
  const fixture = fixtures.find((item) => item.file === 'label-kustom.json');
  const teks = fixture.expected.lines.map((line) => line.text.trim()).join('\n');
  assert.match(teks, /NOTA PENJUALAN/);
  assert.match(teks, /DAFTAR BARANG/);
  assert.match(teks, /No\. Nota/);
  assert.match(teks, /Total Bayar/);
  assert.match(teks, /Sisa/);
  assert.doesNotMatch(teks, /INFORMASI TRANSAKSI/);
});

test('transaksi offline memakai nomor sementara OFF-', () => {
  const fixture = fixtures.find((item) => item.file === 'invoice-offline-sementara.json');
  const teks = fixture.expected.lines.map((line) => line.text).join('\n');
  assert.match(teks, /OFF-1-1731498000000/);
});

test('attachReceiptLines menambahkan baris + metadata kertas', () => {
  const payload = attachReceiptLines({
    store: { printer_size: '58' },
    invoice_no: 'INV-9',
    items: [],
    subtotal: 0,
    discount: 0,
    grand_total: 0,
  });
  assert.equal(payload.receipt_meta.width, 42);
  assert.equal(payload.receipt_meta.margin, 3);
  assert.equal(payload.receipt_meta.font, 'b');
  assert.equal(payload.receipt_meta.inner, 36);
  assert.equal(payload.lines.length, buildReceiptLines({ store: { printer_size: '58' } }).length);
});