const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('app/store-settings/page.js');

test('setelan toko jadi satu halaman dengan pemilih toko', () => {
  assert.match(page, /Semua aturan toko di satu tempat/);
  assert.match(page, /onChange=\{\(event\) => changeBranch\(event\.target\.value\)\}/);
  // Setiap tab memuat setelan untuk toko yang sedang dipilih.
  for (const label of ['Identitas & kontak', 'Landing & aturan', 'Struk & printer', 'Template struk', 'Ongkir', 'Pajak & harga', 'Notifikasi', 'Administrasi']) {
    assert.ok(page.includes(label), `tab ${label} harus ada`);
  }
});

test('aturan per toko: minimal order, produk per halaman, ongkir', () => {
  assert.match(page, /min_order_qty/);
  assert.match(page, /landing_page_size/);
  assert.match(page, /ongkir_provider/);
  assert.match(page, /Contoh: BASIK PGMTA 4 pcs, Anyo Blok B 1 pcs/);
});

test('setelan disimpan per cabang lewat PUT /settings', () => {
  assert.match(page, /branch_id: Number\(branch\)/);
  assert.match(page, /method: 'PUT'/);
  assert.match(page, /store_name/);
  assert.match(page, /receipt_font/);
  assert.match(page, /daily_email_to/);
});

test('template struk punya pratinjau yang sama dengan Android', () => {
  assert.match(page, /buildReceiptPreview/);
  assert.match(page, /receipt-preview-paper/);
  assert.match(page, /receipt-label|receipt_separator/);
});

test('tab administrasi memuat daftar toko, tambah toko, backup, dan tautan alat', () => {
  assert.match(page, /settings\/branches/);
  assert.match(page, /Tambah toko/);
  assert.match(page, /backup/);
  assert.match(page, /settings\/branch-compare/);
  assert.match(page, /settings\/olsera-import/);
});

test('logo toko dan logo invoice bisa diunggah dari tab identitas', () => {
  assert.match(page, /settings\/logo-data/);
  assert.match(page, /store_logo/);
  assert.match(page, /invoice_logo/);
});

test('ada setelan boleh/tidak transaksi saat stok kurang', () => {
  assert.match(page, /Penjualan & stok/);
  assert.match(page, /allow_negative_stock/);
  assert.match(page, /Tidak \(transaksi ditolak bila stok kurang\)/);
});
