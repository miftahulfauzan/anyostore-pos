const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'inventory', 'transfers', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const printSheet = page.slice(page.indexOf('function TransferPrintSheet'), page.indexOf('export default function TransferPage'));

test('riwayat transfer menyediakan aksi print per transfer', () => {
  assert.match(page, /onPrint/);
  assert.match(page, /Print rincian/);
  assert.match(page, /printingTransfer/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /afterprint/);
});

test('print sheet memuat metadata audit dan rincian produk', () => {
  assert.match(page, /TransferPrintSheet/);
  assert.match(page, /row\.number/);
  assert.match(page, /row\.created_at/);
  assert.match(page, /row\.status/);
  assert.match(page, /row\.admin/);
  assert.match(page, /source\.branch_name/);
  assert.match(page, /destination\.branch_name/);
  assert.match(page, /row\.notes/);
  assert.match(page, /row\.cancellation_reason/);
  assert.match(page, /row\.details\?\.to/);
  assert.match(page, /line\.name/);
  assert.match(page, /line\.sku/);
  assert.match(page, /line\.variant_color/);
  assert.match(page, /line\.stock_before/);
  assert.match(page, /line\.stock_after/);
});

test('print sheet memakai ukuran A6 dan menyembunyikan aplikasi lain', () => {
  assert.match(styles, /@page\s*\{[^}]*size:\s*A6 portrait/s);
  assert.match(styles, /\.transfer-print-root\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.transfer-print-sheet\s*\{[^}]*width:\s*105mm/s);
  assert.match(styles, /min-height:\s*148mm/);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \*\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-root,\s*body:has\(\.transfer-print-root\.is-active\) \.transfer-print-root \*/s);
});

test('print sheet hanya memuat rincian barang masuk dan memakai lebar halaman penuh', () => {
  assert.match(printSheet, /title="Barang masuk"/);
  assert.doesNotMatch(printSheet, /title="Barang keluar"/);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\)\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-root\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-sheet\s*\{[^}]*width:\s*100%/s);
});

test('print sheet A6 tidak memotong isi: tinggi mengikuti konten dengan margin', () => {
  assert.match(styles, /@page \{ size: A6 portrait; margin: 0; \}/);
  // Body/root/sheet tidak lagi dikunci 148mm + overflow hidden, karena teks
  // diperbesar dan isi yang panjang tidak boleh terpotong diam-diam.
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\)\s*\{[^}]*overflow:\s*visible/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-root\s*\{[^}]*height:\s*auto/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-sheet\s*\{[^}]*height:\s*auto/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-sheet\s*\{[^}]*overflow:\s*visible/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-sheet\s*\{[^}]*padding:\s*9mm 8mm/s);
});

test('cetak rincian transfer menyembunyikan konten aplikasi dari layout', () => {
  // Dulu hanya visibility:hidden sehingga konten aplikasi tetap memakan
  // halaman dan hasil cetak berupa lembar kosong.
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.app-content > \*:not\(\.transfer-print-root\)\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /\.app-content > \*:not\(\.transfer-print-root\)\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.app-header,/);
  assert.match(styles, /body:has\(\.transfer-print-root\.is-active\) \.transfer-print-root \{ display:\s*block !important; \}/);
});
