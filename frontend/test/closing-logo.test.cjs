const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const page = read('app/closing/page.js');
const css = read('app/globals.css');

test('penutupan web menampilkan logo toko seperti aplikasi', () => {
  // Logo diambil dari setelan cabang, bukan ditebak dari nama file.
  assert.match(page, /const \[storeLogo, setStoreLogo\] = useState\(''\);/);
  assert.match(page, /fetch\(`\$\{api\}\/settings\$\{query\}`/);
  assert.match(page, /settings\.invoice_logo \|\| settings\.store_logo/);
  assert.match(page, /className="receipt-logo"/);
});

test('logo penutupan menghormati show_logo=false dan mode semua toko', () => {
  assert.match(page, /String\(settings\.show_logo \?\? ''\)\.toLowerCase\(\) === 'false'/);
  assert.match(page, /selectedBranchQuery === 'all'/);
});

test('logo resi membulat di layar dan saat dicetak', () => {
  const rules = [...css.matchAll(/\.receipt-logo \{[^}]*\}/g)].map((match) => match[0]);
  assert.ok(rules.length >= 2, 'aturan .receipt-logo layar & cetak harus ada');
  rules.forEach((rule) => assert.match(rule, /border-radius:\s*\d+px/));
});