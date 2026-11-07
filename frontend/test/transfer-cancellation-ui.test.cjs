const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(
  path.join(__dirname, '..', 'app/inventory/transfers/page.js'),
  'utf8',
);

test('web transfer history limits cancellation to owner/gudang completed rows', () => {
  assert.match(page, /\['owner', 'gudang'\]\.includes\(user\?\.role\)/);
  assert.match(page, /canCancelTransfer=\{canCancelTransfer\}/);
  assert.match(page, /canCancelTransfer && row\.status === 'completed'/);
  assert.match(page, /Batalkan transfer/);
});

test('web cancellation confirms, sends optional reason, and refreshes history', () => {
  assert.match(page, /window\.confirm\([\s\S]*Batalkan/);
  assert.match(page, /window\.prompt\([\s\S]*Alasan pembatalan/);
  assert.match(page, /fetch\(`\$\{api\}\/inventory-control\/transfers\/\$\{row\.id\}\/cancel`/);
  assert.match(page, /JSON\.stringify\(\{ reason \}\)/);
  assert.match(page, /loadHistory\(historyAppliedFilters, historyPage\)/);
});

test('web history preserves cancellation reason on cancelled rows', () => {
  assert.match(page, /cancellation_reason/);
  assert.match(page, /Alasan pembatalan/);
});
