const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const mutationPage = readFileSync(resolve(root, 'frontend/app/inventory/mutations/page.js'), 'utf8');
const incomingPage = readFileSync(resolve(root, 'frontend/app/inventory/incoming/page.js'), 'utf8');
const outgoingPage = readFileSync(resolve(root, 'frontend/app/inventory/outgoing/page.js'), 'utf8');
const globalsCss = readFileSync(resolve(root, 'frontend/app/globals.css'), 'utf8');
const inventoryRoute = readFileSync(resolve(root, 'backend/src/routes/inventory.js'), 'utf8');

test('stock mutation entry points use separate incoming and outgoing pages', () => {
  assert.doesNotMatch(mutationPage, /Produk Masuk|Produk Keluar/);
  assert.match(incomingPage, /initialMode="in"/);
  assert.match(outgoingPage, /initialMode="out"/);
});

test('mobile mutation cart stays collapsed until opened and uses a full-width bottom sheet', () => {
  assert.match(globalsCss, /\.mutasi-cart:not\(\.open\) \{ display: none !important; \}/);
  assert.match(globalsCss, /\.mutasi-cart\.open \{ display: grid; position: fixed; right: 0; bottom: 0; left: 0;/);
  assert.match(globalsCss, /max-height: min\(78dvh, 680px\)/);
  assert.match(globalsCss, /\.cart-fab \{[^}]*position: fixed;[^}]*left: 10px;/s);
  assert.match(mutationPage, /aria-expanded=\{cartOpen\}/);
  assert.match(mutationPage, /\{!cartOpen && cart\.length > 0 && <button/);
  assert.doesNotMatch(mutationPage, /className="cart-fab"[^>]*disabled=\{!cart\.length\}/);
});

test('mutation cart exposes exactly one save action', () => {
  const saveActions = mutationPage.match(/Simpan \$\{mode === 'in' \? 'Stock Masuk' : 'Stock Keluar'\}/g) || [];
  assert.equal(saveActions.length, 1);
});

test('deleting a manual mutation writes a valid reversal audit row', () => {
  assert.match(inventoryRoute, /referenceType: 'mutation_delete'/);
  assert.match(inventoryRoute, /referenceId: r\.id/);
  assert.match(inventoryRoute, /let transactionStarted = false/);
  assert.match(inventoryRoute, /if \(transactionStarted\) await conn\.rollback\(\)/);
});
