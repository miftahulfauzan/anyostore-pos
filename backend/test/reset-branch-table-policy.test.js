const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnclassifiedBranchTables } = require('../src/reset-branch-table-policy');

test('reset audit handles returns and preserves users when classifying branch tables', () => {
  assert.deepEqual(
    findUnclassifiedBranchTables([
      { table: 'returns', rows: 3 },
      { table: 'users', rows: 8 },
      { table: 'new_operational_table', rows: 2 },
    ]),
    [{ table: 'new_operational_table', rows: 2 }]
  );
});

test('reset audit ignores empty unclassified branch tables', () => {
  assert.deepEqual(
    findUnclassifiedBranchTables([
      { table: 'new_empty_table', rows: 0 },
      { table: 'returns', rows: 0 },
    ]),
    []
  );
});
