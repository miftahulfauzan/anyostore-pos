const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resetScript = fs.readFileSync(
  path.join(__dirname, '../scripts/reset-target-branch-data.js'),
  'utf8'
);

test('reset command closes the MySQL pool before reporting successful completion', () => {
  assert.match(resetScript, /const result = await withClosedPool\(db, async \(\) => \{/);
  assert.match(resetScript, /process\.stdout\.write\(`\$\{JSON\.stringify\(result\)\}\\n`\);/);
  assert.ok(
    resetScript.indexOf('const result = await withClosedPool(db, async () => {')
      < resetScript.indexOf('process.stdout.write(`${JSON.stringify(result)}\\n`);')
  );
});
