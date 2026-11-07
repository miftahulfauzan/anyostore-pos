const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'pos', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');

test('mobile PWA cart exposes Android-style full-screen and draft controls', () => {
  assert.match(page, /const \[mobileCartOpen, setMobileCartOpen\] = useState\(false\)/);
  assert.match(page, /className="pos-draft-button"/);
  assert.match(page, /aria-label="Buka Draft"/);
  assert.match(page, /className="cart-mobile-header"/);
  assert.match(page, /className="cart-lines-header"/);
  assert.match(page, /aria-label="Tutup keranjang"/);
  assert.match(page, /showCartActions/);
  assert.match(page, /showCartOptions/);
  assert.match(page, /className="pos-cart-footer"/);
  assert.match(page, /Bayar.*rupiah\(total\)/s);
});

test('mobile PWA cart keeps options hidden and uses direct quantity plus item menu actions', () => {
  assert.match(page, /const \[showCartActions, setShowCartActions\] = useState\(false\)/);
  assert.match(page, /const \[showCartOptions, setShowCartOptions\] = useState\(false\)/);
  assert.match(page, /aria-label=\{`Opsi \$\{item\.name\}/);
  assert.match(page, /Ubah harga/);
  assert.match(page, /Hapus item/);
  assert.doesNotMatch(page, /quantity\(item\.cart_id, item\.quantity - 1\)/);
  assert.doesNotMatch(page, /quantity\(item\.cart_id, item\.quantity \+ 1\)/);
});

test('web POS sends hold notes and resumes pending drafts', () => {
  assert.match(page, /const \[notes, setNotes\] = useState\(''\)/);
  assert.match(page, /fetch\(`\$\{apiUrl\}\/transactions\/pending\?branch_id=/);
  assert.match(page, /fetch\(`\$\{apiUrl\}\/transactions\/hold`/);
  assert.match(page, /JSON\.stringify\([\s\S]*notes/);
  assert.match(page, /fetch\(`\$\{apiUrl\}\/transactions\/pending\/\$\{draftId\}\/resume\?branch_id=/);
  assert.match(page, /setNotes\(resumed\.notes/);
});

test('checkout carries the cart notes into the transaction payload', () => {
  assert.match(page, /if \(notes\.trim\(\)\) bodyPayload\.notes = notes\.trim\(\)/);
});

test('mobile PWA cart is a denim full-screen sheet with a scrollable body and fixed footer', () => {
  assert.match(styles, /\.pos-layout \.cart \{[^}]*height:\s*100dvh[^}]*max-height:\s*none/s);
  assert.match(styles, /\.pos-layout \.cart \{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto[^}]*border-radius:\s*0/s);
  assert.match(styles, /\.cart-mobile-header \{[^}]*background:\s*#1e3a5f[^}]*color:\s*#fff/s);
  assert.match(styles, /\.pos-cart-scroll \{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.pos-cart-footer \{[^}]*position:\s*relative[^}]*border-top:/s);
});
