const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'inventory', 'transfers', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');

test('riwayat transfer menyediakan aksi print per transfer', () => {
  assert.match(page, /onPrint/);
  assert.match(page, /Print rincian/);
  assert.match(page, /printingTransfer/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /afterprint/);
});

test('print sheet memuat metadata audit dan dua sisi rincian produk', () => {
  assert.match(page, /TransferPrintSheet/);
  assert.match(page, /row\.number/);
  assert.match(page, /row\.created_at/);
  assert.match(page, /row\.status/);
  assert.match(page, /row\.admin/);
  assert.match(page, /source\.branch_name/);
  assert.match(page, /destination\.branch_name/);
  assert.match(page, /row\.notes/);
  assert.match(page, /row\.cancellation_reason/);
  assert.match(page, /row\.details\?\.from/);
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
