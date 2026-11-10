const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const stockView = read('app/inventory/stock-view.js');
const customers = read('app/customers/page.js');
const reports = read('app/reports/page.js');
const styles = read('app/globals.css');
const backendCustomers = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'customers.js'), 'utf8');

test('kartu ringkasan stok memakai kelas bersama, bukan style inline', () => {
  // Dulu tiap kartu punya style inline sendiri sehingga label pecah dua baris
  // ("Total / Produk") dan angka tidak sejajar.
  assert.match(stockView, /className="stock-summary-grid"/);
  assert.equal((stockView.match(/stock-summary-item/g) || []).length >= 4, true);
  assert.match(stockView, /stock-summary-label/);
  assert.match(stockView, /stock-summary-value/);
  assert.doesNotMatch(stockView, /padding: 16, borderRadius: 8, background/);
  assert.match(styles, /\.stock-summary-grid \{\s*display: grid;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s);
  // Label satu baris: tanpa huruf kapital paksa yang membuat teks terpotong.
  assert.match(styles, /\.stock-summary-label \{[^}]*white-space: nowrap;/s);
  assert.doesNotMatch(styles, /\.stock-summary-grid p:last-child \{ display: none; \}/);
});

test('form pelanggan punya kolom alamat dan API mengembalikannya', () => {
  assert.match(customers, /address: ''/);
  assert.match(customers, /<label>Alamat<textarea rows=\{2\} value=\{form\.address\}/);
  assert.match(customers, /startEdit[\s\S]{0,200}address: c\.address \|\| ''/);
  assert.match(customers, /customer-address/);
  assert.match(backendCustomers, /SELECT id, name, phone, email, address, loyalty_points/);
});

test('halaman laporan tanpa keterangan periode otomatis dan tertutup untuk gudang', () => {
  assert.doesNotMatch(reports, /Periode diterapkan otomatis/);
  assert.doesNotMatch(reports, /period-filter-hint/);
  assert.doesNotMatch(styles, /\.period-filter-hint/);
  // Gudang/kasir yang membuka /reports dialihkan sebelum memanggil endpoint.
  assert.match(reports, /const reportRoleAllowed = !user \|\| \["owner", "manager", "admin"\]\.includes\(user\.role\);/);
  assert.match(reports, /router\.replace\(user\.role === "gudang" \? "\/dashboard" : "\/pos"\)/);
  assert.match(reports, /if \(!reportRoleAllowed\) return;/);
});
