const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const shell = read('app/components/AppShell.js');
const closing = read('app/closing/page.js');
const styles = read('app/globals.css');
const layout = read('app/layout.js');
const landing = read('app/LandingClient.js');
const cashDrawerRoute = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'cash-drawer.js'), 'utf8');

test('kasir web bisa buka/tutup kas di /closing', () => {
  // Tab operasional + pemanggilan endpoint kas.
  assert.match(closing, /Laci Kas/);
  assert.match(closing, /cash-drawer\/open/);
  assert.match(closing, /cash-drawer\/close/);
  assert.match(closing, /cash-drawer\/\$\{moveType\}/);
  // Halaman kas memakai endpoint status yang tidak membalas 404.
  assert.match(closing, /cash-drawer\/current/);
  assert.match(cashDrawerRoute, /router\.get\('\/current'/);
  assert.match(cashDrawerRoute, /drawer: null, expected_cash: 0, movements: \[\]/);
  // Tutup kas wajib alasan saat ada selisih.
  assert.match(closing, /difference !== 0 && !closeNotes\.trim\(\)/);
  // Cetak penutupan tetap tersedia.
  assert.match(closing, /Cetak Penutupan/);
  assert.match(styles, /\.cash-grid \{/);
});

test('menu POS ada di navigasi web', () => {
  assert.match(shell, /\{ href: '\/pos', label: 'POS', icon: ShoppingCart \}/);
});

test('seluruh aplikasi memakai Plus Jakarta Sans', () => {
  assert.match(layout, /Plus\+Jakarta\+Sans/);
  assert.match(styles, /font-family: "Plus Jakarta Sans"/);
  for (const file of ['app/globals.css', 'app/LandingClient.js', 'app/components/LinkBioPage.js', 'app/link/client.js', 'app/produk/[id]/ProdukDetailClient.js']) {
    assert.equal(read(file).includes('DM Sans'), false, `${file} masih memakai DM Sans`);
  }
  assert.equal(landing.includes('DM Sans'), false);
});
