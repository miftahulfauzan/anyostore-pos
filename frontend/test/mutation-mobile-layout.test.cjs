const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app/inventory/mutations/page.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const lastRule = (selector) => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g'))].at(-1)?.[1] || '';

test('mobile mutation cart keeps item rows in a real, independently scrollable list', () => {
  assert.match(page, /cart\.map\(\(c\) => \(/, 'cart items must render from the same state as Total Qty');
  assert.match(page, /const list = document\.querySelector\('#mutation-cart \.mutasi-cart-list'\);[\s\S]*?list\.scrollTop = 0/);
  const mobileCart = lastRule('\\.mutasi-cart\\.open');
  const mobileList = lastRule('\\.mutasi-cart-list');
  assert.match(mobileCart, /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(mobileList, /display:\s*block/);
  assert.match(mobileList, /overflow-y:\s*auto/);
  assert.match(mobileList, /min-height:\s*0/);
});

test('mobile quantity dialog follows iPhone visual viewport above the keyboard', () => {
  const effectStart = page.indexOf("if (!quantityPrompt || !window.matchMedia('(max-width: 600px)')");
  const effectEnd = page.indexOf('}, [quantityPrompt]);', effectStart);
  assert.notEqual(effectStart, -1, 'quantity dialog needs a mobile viewport effect');
  const quantityEffect = page.slice(effectStart, effectEnd);
  assert.match(quantityEffect, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(quantityEffect, /window\.visualViewport\?\.addEventListener\('scroll'/);
  assert.match(quantityEffect, /--quantity-viewport-height/);
  const dialog = lastRule('\\.quantity-dialog-backdrop');
  assert.match(dialog, /--quantity-viewport-top/);
  assert.match(dialog, /--quantity-viewport-bottom/);
  const dialogPanel = lastRule('\\.quantity-dialog');
  assert.match(dialogPanel, /max-height:[^;]*var\(--quantity-viewport-height/);
  assert.match(dialogPanel, /overflow-y:\s*auto/);
});
