const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app/inventory/transfers/page.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const lastRule = (selector) => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g'))].at(-1)?.[1] || '';

test('transfer cart shares the mutation cart structure and has a scrollable item region', () => {
  assert.match(page, /<aside id="transfer-cart"[^>]*className=\{`panel mutasi-cart/);
  assert.match(page, /className="mutasi-cart-header"[\s\S]*?Keranjang Transfer/);
  assert.match(page, /className="mutasi-cart-list"[\s\S]*?cart\.map\(\(c\) => \([\s\S]*?mutasi-cart-item/);
  assert.match(page, /className="mutasi-cart-footer"[\s\S]*?Total Qty[\s\S]*?Transfer Stok/);
  assert.match(page, /aria-controls="transfer-cart"/);

  const mobileCart = lastRule('\\.mutasi-cart\\.open');
  const mobileList = lastRule('\\.mutasi-cart-list');
  assert.match(mobileCart, /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(mobileList, /overflow-y:\s*auto/);
  assert.match(mobileList, /overscroll-behavior-y:\s*contain/);
});

test('transfer cart stays above the mobile keyboard and scrolls the focused quantity row', () => {
  const effectStart = page.indexOf("if (!cartOpen || !window.matchMedia('(max-width: 900px)')");
  const effectEnd = page.indexOf('}, [cartOpen]);', effectStart);
  assert.notEqual(effectStart, -1, 'transfer cart needs a mobile viewport effect');
  const effect = page.slice(effectStart, effectEnd);
  assert.match(effect, /#transfer-cart \.mutasi-cart-list/);
  assert.match(effect, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(effect, /window\.visualViewport\?\.addEventListener\('scroll'/);
  assert.match(effect, /keepFocusedQuantityVisible/);
  assert.match(page, /className="mutasi-cart-qty"/);
});

test('mobile product rack labels and locations stay left-aligned inside narrow cards', () => {
  const rackRules = [...css.matchAll(/\.product-list\.grid-view \.product-rack-[^{]+\{([^}]+)\}/g)].map((match) => match[1]);
  assert.ok(rackRules.some((rule) => /text-align:\s*left/.test(rule)), 'rack content should not inherit centered card text');
  assert.ok(rackRules.some((rule) => /justify-items:\s*start/.test(rule)), 'rack locations should align to the card edge');
  assert.ok(rackRules.some((rule) => /overflow-wrap:\s*anywhere/.test(rule)), 'long warehouse/rack labels should wrap instead of distorting the card');
});
