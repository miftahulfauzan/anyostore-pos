const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stockView = fs.readFileSync(path.join(__dirname, '..', 'app', 'inventory', 'stock-view.js'), 'utf8');

test('halaman Stok menampilkan dan mengedit posisi rak per gudang', () => {
  assert.match(stockView, /rack_position/);
  assert.match(stockView, /Posisi Rak/);
  assert.match(stockView, /inventory\/stock-location/);
});
