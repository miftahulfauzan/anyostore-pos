const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const mutationPage = readFileSync(resolve(root, 'frontend/app/inventory/mutations/page.js'), 'utf8');
const incomingPage = readFileSync(resolve(root, 'frontend/app/inventory/incoming/page.js'), 'utf8');
const outgoingPage = readFileSync(resolve(root, 'frontend/app/inventory/outgoing/page.js'), 'utf8');

test('stock mutation entry points use separate incoming and outgoing pages', () => {
  assert.doesNotMatch(mutationPage, /Produk Masuk|Produk Keluar/);
  assert.match(incomingPage, /initialMode="in"/);
  assert.match(outgoingPage, /initialMode="out"/);
});
