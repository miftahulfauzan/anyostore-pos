const test = require('node:test');
const assert = require('node:assert/strict');
const { TARGET_NAME_GROUPS, pickUniqueBranch } = require('../src/reset-branch-targets');

test('reset target aliases include the production branch name for Metro', () => {
  const metroNames = TARGET_NAME_GROUPS[1];
  const branch = pickUniqueBranch(
    [
      { id: 1, name: 'Anyostore Metro', is_active: 1 },
      { id: 2, name: 'Toko B', is_active: 1 },
    ],
    metroNames,
    'Target branch'
  );

  assert.equal(branch.id, 1);
});

test('reset target resolution rejects ambiguous branch aliases', () => {
  assert.throws(
    () => pickUniqueBranch([
      { id: 1, name: 'Anyostore Metro', is_active: 1 },
      { id: 2, name: 'Metro', is_active: 1 },
    ], TARGET_NAME_GROUPS[1], 'Target branch'),
    /expected exactly one match/
  );
});
