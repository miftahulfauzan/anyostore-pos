const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'globals.css'),
  'utf8',
);
const settingsPage = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'settings', 'page.js'),
  'utf8',
);
const linkPage = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'settings', 'link-page', 'page.js'),
  'utf8',
);
const storeSettingsPage = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'store-settings', 'page.js'),
  'utf8',
);

test('halaman link memiliki workspace editor dan preview yang responsif', () => {
  assert.match(linkPage, /className="link-settings-workspace"/);
  assert.match(css, /\.link-settings-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(300px,\s*380px\)/);
  assert.match(css, /\.link-settings-link-row[^}]*min-width:\s*0/);
  assert.match(css, /\.link-settings-preview-frame[^}]*overflow-x:\s*hidden/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.link-settings-workspace\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test('setelan toko memakai wrapper dan save bar yang tidak melebar di mobile', () => {
  assert.match(settingsPage, /className="settings-page-root"/);
  assert.match(css, /\.settings-page-root\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.settings-page-root[\s\S]*?\.settings-form\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.settings-page-root\s*\{[^}]*gap:\s*12px/);
  assert.match(css, /\.settings-save-bar\s+button\s*\{[^}]*min-width:\s*220px/);
});

test('hub setelan toko mempertahankan tab dan form di dalam lebar layar', () => {
  assert.match(storeSettingsPage, /className="store-settings-page"/);
  assert.match(css, /\.store-settings-page\s*\{[^}]*min-width:\s*0/);
  assert.match(storeSettingsPage, /className="panel store-settings-section-nav"/);
  assert.match(storeSettingsPage, /id="store-settings-section"/);
  assert.match(storeSettingsPage, /<optgroup/);
  assert.match(css, /\.store-settings-section-nav\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(260px,\s*340px\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.store-settings-page\s*\{[^}]*gap:\s*12px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.store-settings-section-nav\s*\{[^}]*grid-template-columns:\s*1fr/);
});

