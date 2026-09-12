const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const mutationPage = readFileSync(resolve(root, 'frontend/app/inventory/mutations/page.js'), 'utf8');
const incomingPage = readFileSync(resolve(root, 'frontend/app/inventory/incoming/page.js'), 'utf8');
const outgoingPage = readFileSync(resolve(root, 'frontend/app/inventory/outgoing/page.js'), 'utf8');
const globalsCss = readFileSync(resolve(root, 'frontend/app/globals.css'), 'utf8');

test('stock mutation entry points use separate incoming and outgoing pages', () => {
  assert.doesNotMatch(mutationPage, /Produk Masuk|Produk Keluar/);
  assert.match(incomingPage, /initialMode="in"/);
  assert.match(outgoingPage, /initialMode="out"/);
});

test('mobile mutation cart is a compact floating panel instead of a full-width overlay', () => {
  assert.match(globalsCss, /\.mutasi-cart \{ position: fixed; right: 14px; bottom: 72px;/);
  assert.match(globalsCss, /width: min\(360px, calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(globalsCss, /\.mutasi-cart \{ position: fixed; left: 0; right: 0; bottom: 0;/);
});

test('mutation cart exposes exactly one save action', () => {
  const saveActions = mutationPage.match(/Simpan \$\{mode === 'in' \? 'Stock Masuk' : 'Stock Keluar'\}/g) || [];
  assert.equal(saveActions.length, 1);
});
