const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'app');
const css = fs.readFileSync(path.join(root, 'globals.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'products/page.js'), 'utf8');
const rules = (selector) => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g'))].map((match) => match[1]);

test('product cards expose dedicated identity, inventory, and rack layout hooks', () => {
  assert.match(page, /className="product-row product-card"/);
  assert.match(page, /className="product-description product-card__content"/);
  assert.match(page, /className="product-card__identity"/);
  assert.match(page, /className="product-card__inventory"/);
  assert.match(page, /className="product-rack-locations product-card__locations"/);
});

test('grid cards use consistent padding and only keep as many columns as fit', () => {
  const cardRules = rules('\\.product-list\\.grid-view \\.product-card');
  const gridRules = rules('\\.product-list\\.grid-view');
  assert.ok(cardRules.some((card) => /padding:\s*22px/.test(card)));
  assert.ok(cardRules.some((card) => /display:\s*grid/.test(card)));
  assert.ok(gridRules.some((grid) => /minmax\(min\(100%,\s*292px\),\s*1fr\)/.test(grid)));
});

test('product card controls stay in a fixed, single row and rack values align right', () => {
  const actionRules = rules('\\.product-list\\.grid-view \\.product-card \\.product-actions');
  const iconRules = rules('\\.product-list\\.grid-view \\.product-card \\.icon-action');
  const rackRules = rules('\\.product-list\\.grid-view \\.product-card__locations');
  assert.ok(actionRules.some((actions) => /display:\s*grid/.test(actions)));
  assert.ok(actionRules.some((actions) => /grid-template-columns:\s*repeat\(5,\s*44px\)/.test(actions)));
  assert.ok(actionRules.some((actions) => /gap:\s*6px/.test(actions)));
  assert.ok(iconRules.some((icons) => /width:\s*44px/.test(icons) && /height:\s*44px/.test(icons)));
  assert.ok(rackRules.some((rack) => /grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)/.test(rack)));
  assert.ok(rackRules.some((rack) => /align-items:\s*center/.test(rack)));
});

test('inventory summary is separated from controls without excess height', () => {
  const inventory = rules('\\.product-list\\.grid-view \\.product-card__inventory').at(-1) || '';
  assert.match(inventory, /display:\s*grid/);
  assert.match(inventory, /gap:\s*4px/);
  assert.match(inventory, /border-top:\s*1px solid var\(--border\)/);
  assert.match(inventory, /padding-top:\s*12px/);
});
