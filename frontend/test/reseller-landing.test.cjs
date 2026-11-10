const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reseller = read('app/reseller/page.js');
const landing = read('app/LandingClient.js');
const sitemap = read('app/sitemap.js');

test('halaman /reseller memakai landing yang sama dengan cabang Blok B', () => {
  assert.match(reseller, /import LandingClient from '\.\.\/LandingClient';/);
  assert.match(reseller, /<LandingClient branchMatch="Blok B" \/>/);
  assert.match(reseller, /canonical: '\/reseller'/);
  assert.match(sitemap, /\/reseller/);
});

test('landing cabang mengirim branch_id ke API publik', () => {
  assert.match(landing, /export default function LandingPage\(\{ branchMatch = '' \} = \{\}\)/);
  assert.match(landing, /public\/branches/);
  assert.match(landing, /`\$\{item\.name \|\| ''\} \$\{item\.address \|\| ''\}`\.toUpperCase\(\)\.includes\(branchMatch\.toUpperCase\(\)\)/);
  // settings, produk, dan detail produk membawa branch_id.
  assert.match(landing, /public\/settings\$\{branchQuery \? `\?\$\{branchQuery\}` : ''\}/);
  assert.match(landing, /branchId \? \{ branch_id: String\(branchId\) \} : \{\}/);
  assert.match(landing, /public\/products\/\$\{product\.id\}\$\{branchQuery \? `\?\$\{branchQuery\}` : ''\}/);
  assert.match(landing, /public\/products\/\$\{productId\}\$\{branchQuery \? `\?\$\{branchQuery\}` : ''\}/);
  // Menunggu cabang ditemukan sebelum memuat katalog.
  assert.match(landing, /if \(!branchReady\) return;/);
});
