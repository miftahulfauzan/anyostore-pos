const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'app', file), 'utf8');
const page = read('inventory/opname/page.js');
const css = read('globals.css');

test('halaman opname punya tombol Export Excel dengan gudang terpilih', () => {
  assert.match(page, /Export Excel/);
  assert.match(page, /\/inventory-control\/opnames\/export\?/);
  assert.match(page, /warehouse_id: String\(warehouse\)/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /Content-Disposition/);
});

test('ekspor mengirim cabang untuk owner/gudang dan memakai cookie sesi', () => {
  assert.match(page, /if \(\['owner', 'gudang'\]\.includes\(role\) && selectedWarehouse\?\.branch_id\)/);
  assert.match(page, /credentials:/);
  assert.match(page, /cache: 'no-store'/);
});

test('tombol export sejajar dengan jumlah item dan menumpuk di HP', () => {
  assert.match(css, /\.opname-toolbar\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.opname-toolbar button\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.opname-toolbar button\s*\{[^}]*flex:\s*1 1 100%/s);
});