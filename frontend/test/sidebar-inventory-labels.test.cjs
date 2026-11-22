const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', 'app');

// Nama menu paritas Android: halaman /inventory/movements bernama
// "Pergerakan Stok" di kedua platform (dulu web "Riwayat Stok").
test('label sidebar dan error halaman movements memakai Pergerakan Stok', () => {
  const shell = fs.readFileSync(path.join(app, 'components/AppShell.js'), 'utf8');
  assert.match(shell, /href: '\/inventory\/movements', label: 'Pergerakan Stok'/);
  assert.doesNotMatch(shell, /label: 'Riwayat Stok'/);

  const page = fs.readFileSync(path.join(app, 'inventory/movements/page.js'), 'utf8');
  assert.doesNotMatch(page, /Riwayat stok tidak dapat dimuat/);
});