const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const moduleSource = read('app/lib/receipt-name.js').replace(/^export /gm, '');
const { storeNameFontSize, RECEIPT_LOGO_BOX } = new Function(`${moduleSource}
  return { storeNameFontSize, RECEIPT_LOGO_BOX };`)();

const receiptPage = read('app/receipt/[id]/page.js');
const closingPage = read('app/closing/page.js');

test('nama toko dihitung agar lebarnya sama dengan kotak logo', () => {
  assert.equal(RECEIPT_LOGO_BOX, 120);
  // Monospace 0.6em: 11 karakter * 0.6 * 18.2px = 120px.
  assert.equal(storeNameFontSize('BASIK PGMTA'), 18.2);
  assert.equal(storeNameFontSize('Anyostore Metro'), 13.3);
  // Nama sangat panjang tetap terbaca (min 11px) dan huruf tunggal tidak raksasa.
  assert.equal(storeNameFontSize('ANYOSTORE TOKO BLOK B TANAH ABANG JAKARTA'), 11);
  assert.equal(storeNameFontSize('A'), 22);
  assert.equal(storeNameFontSize(''), 22);
});

test('halaman resi merender nama toko sendiri selebar logo', () => {
  // Baris nama dari server dibuang supaya tidak dobel.
  assert.match(receiptPage, /let nameLineRemoved = false;/);
  assert.match(receiptPage, /line\.text\.trim\(\) === storeName/);
  assert.match(receiptPage, /className="receipt-store-name"/);
  assert.match(receiptPage, /storeNameFontSize\(storeName\)/);
});

test('halaman penutupan memakai aturan ukuran yang sama', () => {
  assert.match(closingPage, /storeNameFontSize/);
  assert.match(closingPage, /className="receipt-store-name"/);
});
