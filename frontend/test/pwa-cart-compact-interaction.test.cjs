const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'pos', 'page.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const finalMobile = styles.slice(styles.lastIndexOf('/* Final mobile POS cart overrides'));
const quantityMarkup = page.match(/<div className="quantity">[\s\S]*?<\/div>/)?.[0] || '';

test('PWA cart keeps fixed product rows and a sticky footer on mobile', () => {
  assert.match(finalMobile, /\.pos-layout \.cart\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
  assert.match(finalMobile, /\.cart-lines\s*\{[^}]*gap:\s*8px/s);
  assert.match(finalMobile, /\.cart-lines article\s*\{[^}]*height:\s*72px[^}]*min-height:\s*72px[^}]*padding:\s*8px\s+0/s);
  assert.match(finalMobile, /\.pos-cart-footer\s*\{[^}]*position:\s*sticky/s);
});

test('PWA transaction date stays compact and editable with the native date picker', () => {
  assert.match(page, /className="pos-cart-date pos-transaction-date"[\s\S]*<input type="date"/);
  assert.match(finalMobile, /\.pos-transaction-date\s*\{[^}]*grid-template-columns:/s);
  assert.match(finalMobile, /\.pos-transaction-date\s*\{[^}]*min-height:\s*44px/s);
  assert.match(finalMobile, /\.pos-transaction-date input\s*\{[^}]*height:\s*44px[^}]*min-height:\s*44px/s);
  assert.match(finalMobile, /\.pos-transaction-date small\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('PWA quantity input selects its value and commits numeric edits', () => {
  assert.match(quantityMarkup, /<input[\s\S]*type="number"[\s\S]*min="1"[\s\S]*inputMode="numeric"/);
  assert.match(quantityMarkup, /pattern="\[0-9\]\*"/);
  assert.match(quantityMarkup, /enterKeyHint="done"/);
  assert.match(quantityMarkup, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}/);
  assert.match(quantityMarkup, /onBlur=\{\(event\) => \{[\s\S]*quantity\(item\.cart_id,/);
  assert.match(quantityMarkup, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key !== 'Enter'[\s\S]*event\.currentTarget\.blur\(\)/);
});
