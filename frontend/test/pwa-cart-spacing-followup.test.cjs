const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'pos', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const finalMobile = styles.slice(styles.lastIndexOf('/* Final mobile POS cart overrides'));
const quantityMarkup = page.match(/<div className="quantity">[\s\S]*?<\/div>/)?.[0] || '';

test('mobile cart content stays start-aligned instead of stretching product rows', () => {
  assert.match(finalMobile, /\.pos-cart-scroll\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*justify-content:\s*flex-start/s);
  assert.match(finalMobile, /\.pos-cart-scroll\s*\{[^}]*padding:\s*8px\s+16px\s+12px/s);
  assert.match(finalMobile, /\.cart-lines\s*\{[^}]*grid-auto-rows:\s*72px[^}]*align-content:\s*start/s);
  assert.match(finalMobile, /\.cart-lines article\s*\{[^}]*height:\s*72px[^}]*min-height:\s*72px/s);
});

test('mobile cart controls use compact aligned dimensions', () => {
  assert.match(finalMobile, /\.cart-lines article\s*\{[^}]*padding:\s*8px\s+0[^}]*border-bottom:/s);
  assert.match(finalMobile, /\.cart-lines \.quantity input\s*\{[^}]*width:\s*56px[^}]*height:\s*42px[^}]*min-height:\s*42px/s);
  assert.match(finalMobile, /\.pos-transaction-date input\s*\{[^}]*height:\s*42px[^}]*min-height:\s*42px/s);
  assert.match(finalMobile, /\.pos-transaction-date small\s*\{[^}]*display:\s*none/s);
});

test('mobile quantity focus scrolls the input above the keyboard', () => {
  assert.match(quantityMarkup, /onFocus=\{\(event\) => \{[\s\S]*input\.select\(\)[\s\S]*requestAnimationFrame[\s\S]*scrollIntoView\(\{\s*block:\s*'center',\s*inline:\s*'nearest'\s*\}\)/);
});
