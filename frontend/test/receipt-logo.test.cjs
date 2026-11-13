const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Modul ESM dibaca sebagai teks lalu dieksekusi tanpa import statement.
const invoiceSource = read('app/lib/invoice-image.js').replace(/^export /gm, '');
const invoice = new Function(`${invoiceSource}
  return { storeLogoUrl, loadInvoiceLogo, renderInvoiceCanvas, shareInvoiceImage };`)();
const { storeLogoUrl } = invoice;

const css = read('app/globals.css');
const invoiceJs = read('app/lib/invoice-image.js');
const posPage = read('app/pos/page.js');
const receiptPage = read('app/receipt/[id]/page.js');

test('logo resi web membulat seperti cetak thermal', () => {
  // Dua aturan .receipt-logo (layar dan cetak) wajib punya border-radius.
  const rules = [...css.matchAll(/\.receipt-logo \{[^}]*\}/g)].map((match) => match[0]);
  assert.ok(rules.length >= 2, 'aturan .receipt-logo layar & cetak harus ada');
  rules.forEach((rule) => assert.match(rule, /border-radius:\s*16%;/));
});

test('nama toko di bawah logo lebih besar dan logo selalu center', () => {
  assert.match(css, /\.receipt-store h1 \{[^}]*font-size: 19px;/);
  assert.match(css, /\.receipt-logo \{[^}]*margin-inline: auto;/);
  // Saat dicetak dari browser, kertas ikut di tengah halaman (bukan menempel kiri).
  assert.match(css, /@media print \{[\s\S]*?\.receipt-paper \{[^}]*margin: 0 auto;/);
});

test('rasio sudut logo sama di web dan cetak thermal', () => {
  // .receipt-logo memakai 16% sisi terpendek; printer memakai 0.16.
  const printer = fs.readFileSync(
    require('node:path').join(__dirname, '..', '..', 'mobile', 'lib', 'src', 'printer_service.dart'),
    'utf8',
  );
  assert.match(printer, /math\.min\(width, height\) \* 0\.16/);
  [css, read('app/closing/page.js')].forEach(() => {});
});

test('URL logo diambil dari setelan cabang, bukan ditebak', () => {
  assert.equal(storeLogoUrl({ invoice_logo: '/uploads/a.png' }, 'https://anyostore.my.id/api'), 'https://anyostore.my.id/uploads/a.png');
  assert.equal(storeLogoUrl({ store_logo: 'uploads/b.png' }, '/api'), '/uploads/b.png');
  // invoice_logo menang atas store_logo (logo kepala invoice).
  assert.equal(storeLogoUrl({ invoice_logo: '/uploads/inv.png', store_logo: '/uploads/app.png' }), '/uploads/inv.png');
  // Logo dimatikan di setelan -> tidak dipakai.
  assert.equal(storeLogoUrl({ invoice_logo: '/uploads/a.png', show_logo: 'false' }), '');
  assert.equal(storeLogoUrl({}), '');
  assert.equal(storeLogoUrl(null), '');
});

test('gambar invoice memakai logo asli dengan sudut membulat + fallback inisial', () => {
  assert.match(invoiceJs, /function drawCoverImage/);
  assert.match(invoiceJs, /ctx\.clip\(\)/);
  assert.match(invoiceJs, /roundedRect\(ctx, pad, logoY, logoSize, logoSize, 22\)/);
  assert.match(invoiceJs, /drawCoverImage\(ctx, logo, pad, logoY, logoSize, logoSize\)/);
  // Tanpa logo tetap ada inisial nama toko.
  assert.match(invoiceJs, /ctx\.fillText\(initial,/);
  // Logo dimuat sebelum kanvas digambar; gagal/timeout tidak menggagalkan invoice.
  assert.match(invoiceJs, /await loadInvoiceLogo\(payload\.logoUrl\)/);
  assert.match(invoiceJs, /setTimeout\(\(\) => finish\(null\), timeoutMs\)/);
});

test('POS dan halaman resi mengirim logoUrl saat membagikan invoice', () => {
  [posPage, receiptPage].forEach((page) => assert.match(page, /storeLogoUrl/));
  assert.match(posPage, /logoUrl: storeLogoUrl\(settings, apiUrl\)/);
  assert.match(receiptPage, /logoUrl: storeLogoUrl\(data\.store \|\| \{\}, api\)/);
});