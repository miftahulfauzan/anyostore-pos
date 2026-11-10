const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const invoice = read('app/lib/invoice-image.js');
const pos = read('app/pos/page.js');
const receipt = read('app/receipt/[id]/page.js');
const styles = read('app/globals.css');
const printer = fs.readFileSync(path.join(root, '..', 'backend', 'src', 'routes', 'printer.js'), 'utf8');

test('PWA merender invoice 3:4 dan membagikannya', () => {
  assert.match(invoice, /const OUTPUT_WIDTH = 1080;/);
  assert.match(invoice, /const OUTPUT_HEIGHT = 1440;/);
  assert.match(invoice, /navigator\.canShare/);
  assert.match(invoice, /navigator\.share\(\{ files: \[file\]/);
  // Fallback unduh bila Web Share API tidak mendukung file.
  assert.match(invoice, /link\.download = file\.name/);
});

test('aturan isi invoice sama dengan Android', () => {
  assert.match(invoice, /showsAnyostoreBrand/);
  assert.match(invoice, /instagramFor/);
  assert.match(invoice, /'@basik.pgmta'/);
  assert.match(invoice, /0042813603/);
  assert.match(invoice, /1640000929465/);
  assert.match(invoice, /Miftahul Fauzan/);
  assert.match(invoice, /cek produk kami lainnya anyostore\.my\.id/);
  assert.doesNotMatch(invoice, /tidak dapat ditukar/);
  assert.doesNotMatch(invoice, /LUNAS/);
});

test('tombol bagikan ada di POS dan halaman struk', () => {
  assert.match(pos, /shareInvoiceDraft/);
  assert.match(pos, /transactions\/invoice-preview/);
  assert.match(pos, /className="pos-share-invoice"/);
  assert.match(receipt, /Bagikan Invoice/);
  assert.match(receipt, /shareInvoiceImage\(/);
  assert.match(styles, /\.pos-cart-footer \.pos-share-invoice/);
  // Nomor WhatsApp ikut dikirim ke struk agar header invoice lengkap.
  assert.match(printer, /whatsapp_numbers/);
});
