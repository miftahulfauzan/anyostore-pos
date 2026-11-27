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
const backendInventory = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'inventory.js'), 'utf8');

test('halaman stok merangkum status dalam hero dan menyediakan filter APK', () => {
  assert.match(stockView, /className="stock-overview-hero(?: no-print)?"/);
  assert.match(stockView, /className="stock-status-donut"/);
  assert.match(stockView, /data-stock-status="low"/);
  assert.match(stockView, /data-stock-status="out"/);
  assert.match(stockView, /Semua[\s\S]*Menipis[\s\S]*Habis/);
  assert.match(stockView, /aria-pressed=\{statusFilter ===/);
  assert.match(styles, /\.stock-overview-hero \{/);
  assert.match(styles, /\.stock-status-donut \{/);
  assert.match(styles, /\.stock-product-row \{/);
  assert.match(styles, /\.dark \.stock-overview-hero/);
});

test('status produk mengikuti batas APK untuk stok negatif, habis, dan minimum', async () => {
  const { stockStatus } = await import('../app/inventory/stock-status.mjs');
  const fixtures = [
    [{ total: -1, min_stock: 3 }, 'out'],
    [{ total: 0, min_stock: 3 }, 'out'],
    [{ total: 1, min_stock: 3 }, 'low'],
    [{ total: 3, min_stock: 3 }, 'low'],
    [{ total: 4, min_stock: 3 }, 'safe'],
  ];
  assert.deepEqual(fixtures.map(([group]) => stockStatus(group)), fixtures.map(([, expected]) => expected));
});

test('header cetak menampilkan ringkasan baris yang dicetak', () => {
  const printHeader = stockView.match(/<div className="report-print-header">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
  assert.match(printHeader, /Total Produk: \{printSummary\.total_products\}/);
  assert.match(printHeader, /Total Stok: \{money\(printSummary\.total_stock\)\}/);
});

test('tanggal cetak diperbarui saat dialog cetak dibuka', () => {
  assert.match(stockView, /import \{ flushSync \} from 'react-dom'/);
  assert.match(stockView, /addEventListener\('beforeprint', updatePrintDate\)/);
  assert.match(stockView, /removeEventListener\('beforeprint', updatePrintDate\)/);
  assert.match(stockView, /const updatePrintDate = \(\) => flushSync\(\(\) => setPrintDate\(new Date\(\)\.toLocaleString\('id-ID'\)\)\)/);
});

test('edit rak hanya tersedia untuk gudang pada cabang produk', () => {
  assert.match(stockView, /if \(!Object\.hasOwn\(product\.qtyByWarehouse, String\(warehouse\.id\)\)\) return null;/);
});

test('nama dan status produk tetap gelap saat dicetak dari tema gelap', () => {
  const stockPrintStyles = styles.slice(styles.lastIndexOf('@media print'));
  assert.match(stockPrintStyles, /\.stock-matrix \.stock-matrix-product strong \{[^}]*color: #111827 !important;/s);
  assert.match(stockPrintStyles, /\.stock-matrix \.stock-status-badge \{[^}]*color: #176443 !important;/s);
  assert.match(stockPrintStyles, /\.stock-matrix \.stock-status-badge\[data-stock-status="low"\] \{[^}]*color: #88530d !important;/s);
  assert.match(stockPrintStyles, /\.stock-matrix \.stock-status-badge\[data-stock-status="out"\] \{[^}]*color: #9f3028 !important;/s);
});

test('summary stok menganggap saldo negatif sebagai stok habis', () => {
  assert.match(backendInventory, /COALESCE\(SUM\(total_stock <= 0\), 0\) AS out_of_stock/);
});

test('daftar stok memuat produk aktif meski belum punya baris saldo gudang', () => {
  const warehouseStockRoute = backendInventory.slice(backendInventory.indexOf("router.get('/stock-by-warehouse'"));
  assert.match(warehouseStockRoute, /FROM products p/);
  assert.match(warehouseStockRoute, /LEFT JOIN warehouses w ON w\.branch_id = p\.branch_id AND w\.is_active = TRUE/);
  assert.match(warehouseStockRoute, /LEFT JOIN warehouse_stocks ws ON ws\.product_id = p\.id AND ws\.warehouse_id = w\.id AND ws\.variant_id IS NULL/);
  assert.match(warehouseStockRoute, /p\.id AS product_id/);
});

test('form pelanggan punya kolom alamat dan API mengembalikannya', () => {
  assert.match(customers, /address: ''/);
  assert.match(customers, /<label>Alamat<textarea rows=\{2\} value=\{form\.address\}/);
  assert.match(customers, /startEdit[\s\S]{0,200}address: c\.address \|\| ''/);
  assert.match(customers, /customer-address/);
  // Ekspedisi ikut di form dan SELECT pelanggan (dipakai blok PENGIRIMAN invoice).
  assert.match(customers, /expedition: ''/);
  assert.match(customers, /customer-expedition-options/);
  assert.match(backendCustomers, /SELECT id, name, phone, email, address, expedition, membership_tier/);
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
