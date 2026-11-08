const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'app', 'pos', 'page.js');
const page = fs.readFileSync(pagePath, 'utf8');
const notification = fs.readFileSync(path.join(root, 'app', 'components', 'NotificationCenter.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const finalMobile = styles.slice(styles.lastIndexOf('/* Final mobile POS cart overrides'));
const defaultsPath = path.join(root, 'app', 'pos', 'cart-defaults.cjs');

test('PWA POS suppresses only routine loading and success notices on mobile', () => {
  assert.match(notification, /function isCompactPosRoute\(\)/);
  assert.match(notification, /isCompactPosRoute\(\)\s*&&\s*\(type === 'loading' \|\| type === 'success'\)/);
  assert.match(notification, /window\.location\.pathname === '\/pos'/);
  assert.match(notification, /max-width:\s*820px/);
});

test('Basik and Metro first cart additions default to four pieces', () => {
  assert.ok(fs.existsSync(defaultsPath), 'cart default helper should exist');
  const { defaultCartQuantity } = require(defaultsPath);
  assert.equal(defaultCartQuantity('TOKO BASIK'), 4);
  assert.equal(defaultCartQuantity('Metro'), 4);
  assert.equal(defaultCartQuantity('Toko Blok B'), 1);
  assert.equal(defaultCartQuantity(''), 1);
  assert.match(page, /defaultCartQuantity\(selectedStore\?\.name\)/);
  assert.match(page, /quantity: item\.quantity \+ 1/);
});

test('mobile PWA cart rows are fixed at 64px and controls fit inside', () => {
  assert.match(finalMobile, /\.cart-lines\s*\{[^}]*grid-auto-rows:\s*64px/s);
  assert.match(finalMobile, /\.cart-lines article\s*\{[^}]*height:\s*64px[^}]*min-height:\s*64px/s);
  assert.match(finalMobile, /\.cart-lines \.quantity input\s*\{[^}]*height:\s*40px[^}]*min-height:\s*40px/s);
  assert.match(finalMobile, /\.cart-line-menu\s*\{[^}]*height:\s*40px[^}]*min-height:\s*40px/s);
});

test('mobile PWA cart fills the viewport', () => {
  assert.match(finalMobile, /\.pos-layout \.cart\s*\{[^}]*position:\s*fixed[^}]*top:\s*0[^}]*right:\s*0[^}]*bottom:\s*0[^}]*left:\s*0/s);
  assert.match(finalMobile, /\.pos-layout \.cart\s*\{[^}]*width:\s*100vw[^}]*height:\s*100dvh[^}]*min-height:\s*100dvh/s);
  assert.match(finalMobile, /\.pos-layout \.cart\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/s);
});
