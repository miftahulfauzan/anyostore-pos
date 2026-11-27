const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'account-switcher', 'page.js'), 'utf8');

test('account actions proceed when there is no unsaved work', () => {
  const guard = source.match(/function guardUnsaved\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(guard, 'account-switcher must keep its unsaved-work guard');
  assert.match(guard[1], /return\s+!hasUnsavedWork\(\)\s*\|\|\s*window\.confirm\(/);
  assert.equal((source.match(/if \(!guardUnsaved\(\)\) return;/g) || []).length, 2);
});
