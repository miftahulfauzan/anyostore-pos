/* eslint-disable no-undef */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = new URL('../', `file://${__dirname}/`);
const appShell = fs.readFileSync(new URL('app/components/AppShell.js', root), 'utf8');

test('sidebar terbuka dengan geser dari tepi kiri layar di HP', () => {
  const start = appShell.indexOf('// Geser dari tepi kiri layar membuka sidebar');
  assert.notEqual(start, -1, 'handler geser sidebar hilang');
  const handler = appShell.slice(start, appShell.indexOf('function logout()', start));

  // Hanya untuk layout HP; desktop memakai sidebar permanen.
  assert.match(handler, /matchMedia\('\(max-width: 820px\)'\)\.matches/);
  // Zona mulai 24 px, bukan 0, karena tepi kiri dipakai gesture Back Android.
  assert.match(handler, /const edgeZone = 24;/);
  assert.match(handler, /const threshold = 56;/);
  assert.match(handler, /tracking = touch\.clientX <= edgeZone;/);
  // Geseran vertikal (scroll daftar) tidak boleh dianggap swipe buka/tutup.
  assert.match(handler, /if \(Math\.abs\(dy\) > Math\.abs\(dx\)\) \{ tracking = false; return; \}/);
  assert.match(handler, /dx >= threshold\) \{ tracking = false; setMobileNavOpen\(true\); \}/);
  // Saat sidebar terbuka, geser ke kiri menutupnya dan hanya dilacak dari
  // dalam sidebar supaya tabel/chip di konten tetap bisa digeser.
  assert.match(handler, /tracking = Boolean\(sidebarRef\.current\?\.contains\(event\.target\)\);/);
  assert.match(handler, /dx <= -threshold\) \{ tracking = false; setMobileNavOpen\(false\); \}/);
  // Listener pasif + dibersihkan saat state berubah.
  assert.match(handler, /window\.addEventListener\('touchstart', onTouchStart, \{ passive: true \}\)/);
  assert.match(handler, /window\.addEventListener\('touchmove', onTouchMove, \{ passive: true \}\)/);
  assert.match(handler, /window\.removeEventListener\('touchstart', onTouchStart\)/);
  assert.match(handler, /window\.removeEventListener\('touchmove', onTouchMove\)/);
  assert.match(appShell, /\}, \[mobileNavOpen\]\);/);
});