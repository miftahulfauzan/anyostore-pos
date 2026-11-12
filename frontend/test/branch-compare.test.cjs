const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('app/settings/branch-compare/page.js');
const shell = read('app/components/AppShell.js');
const settingsPage = read('app/settings/page.js');
const backend = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'settings.js'), 'utf8');

test('halaman Bandingkan Setelan hanya untuk owner', () => {
  // Menu tunggal Setelan Toko; halaman banding ditautkan dari tab Administrasi.
  assert.match(shell, /href: '\/store-settings', label: 'Setelan Toko'/);
  assert.match(read('app/store-settings/page.js'), /settings\/branch-compare/);
  assert.match(page, /role === 'owner'/);
  assert.match(settingsPage, /settings\/branch-compare/);
});

test('halaman memakai endpoint banding, salin, dan simpan setelan', () => {
  assert.match(page, /settings\/compare\?source_id=/);
  assert.match(page, /settings\/compare\/apply/);
  assert.match(page, /keys: selected/);
  // Nilai cabang tujuan bisa diubah langsung lalu disimpan lewat PUT /settings.
  assert.match(page, /branch_id: Number\(target\)/);
  assert.match(page, /method: 'PUT'/);
  assert.match(page, /dirtyKeys/);
});

test('kunci boolean dirender sebagai pilihan Ya/Tidak', () => {
  assert.match(page, /BOOLEAN_KEYS/);
  assert.match(page, /<option value="true">Ya<\/option>/);
  assert.match(page, /<option value="false">Tidak<\/option>/);
});

test('identitas toko tidak bisa dicentang untuk disalin', () => {
  assert.match(page, /disabled=\{!row\.editable \|\| row\.identity\}/);
  assert.match(page, /identitas/);
});

test('backend menolak penyalinan identitas dan rahasia', () => {
  assert.match(backend, /router\.get\('\/compare', authorize\('owner'\)/);
  assert.match(backend, /router\.post\('\/compare\/apply', authorize\('owner'\)/);
  assert.match(backend, /const SECRET_KEYS = new Set/);
  assert.match(backend, /include_identity/);
  assert.match(backend, /ON DUPLICATE KEY UPDATE `value`=VALUES\(`value`\)/);
});

test('setelan template struk ikut terdaftar sebagai kunci yang bisa dibandingkan', () => {
  for (const key of ['receipt_font', 'receipt_separator', 'receipt_margin', 'receipt_title_info', 'receipt_label_total', 'receipt_show_change']) {
    assert.ok(backend.includes(`'${key}'`), `${key} belum ada di whitelist settings`);
  }
});
