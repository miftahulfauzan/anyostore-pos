const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBranchQuery } = require('../app/components/app-state.cjs');

const pagePath = path.join(__dirname, '../app/inventory/barcodes/page.js');
const pageSource = fs.readFileSync(pagePath, 'utf8');

test('barcode page reads and sends the shared Owner branch context', () => {
  assert.match(pageSource, /useAppSession/);
  assert.match(pageSource, /createBranchQuery\(user\?\.role, activeBranchId\)/);
  assert.match(pageSource, /branchQuery/);
  assert.deepEqual(createBranchQuery('owner', 'all'), { branch_id: 'all' });
  assert.deepEqual(createBranchQuery('owner', '8'), { branch_id: '8' });
});

test('barcode page reloads the catalog when the selected branch changes', () => {
  assert.match(pageSource, /activeBranchId/);
  assert.match(pageSource, /\[.*activeBranchId.*\]/s);
});
