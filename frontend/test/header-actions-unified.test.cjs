const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');

// Aksi header sempat tampil inline (menempel tanpa jarak) karena
// `.header-action-links` tidak punya aturan dasar, dan <button> polos memakai
// ukuran default sehingga lebih besar dari `a.button-link`. Semua halaman
// berbagi AppShell, jadi satu aturan dasar menyeragamkan seluruh halaman.
test('header actions selalu flex dengan jarak antar tombol', () => {
  assert.match(
    css,
    /\.header-action-links\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px/s,
    'header-action-links harus flex dengan gap 8px',
  );
});

test('link dan button di header memakai ukuran yang sama', () => {
  assert.match(
    css,
    /\.header-action-links\s*>\s*\.button-link,\s*\n\.header-action-links\s*>\s*button\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*8px 14px;[^}]*border-radius:\s*6px;[^}]*font-size:\s*var\(--fs-sm\);/s,
    'link dan button header harus berbagi tinggi, padding, radius, dan ukuran font yang sama',
  );
});

test('pemilih toko dan tombol tema setinggi tombol aksi', () => {
  assert.match(css, /\.header-actions\s*>\s*\.branch-switcher \.branch-switcher-trigger\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.header-actions\s*>\s*\.theme-toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
});

test('label tombol header boleh membungkus di layar sempit', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*700px\)[\s\S]*?\.header-action-links\s*>\s*a\.button-link,\s*\n\s*\.header-action-links\s*>\s*button\s*\{[^}]*white-space:\s*normal;/s,
    'di layar sempit label harus bisa dua baris, bukan terpotong',
  );
});
