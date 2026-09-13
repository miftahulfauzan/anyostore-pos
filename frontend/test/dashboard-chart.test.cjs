const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

test('warehouse movement chart keeps the trend lines unfilled', () => {
  const lineRule = styles.match(/\.trend-line\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(lineRule, /fill:\s*none/);
  const variantRules = [...styles.matchAll(/\.trend-line\.trend-(?:in|out)[^{]*\{([^}]+)\}/g)].map((match) => match[1]);
  assert.ok(variantRules.length >= 2);
  for (const rule of variantRules) {
    const fill = rule.match(/fill:\s*([^;]+)/)?.[1]?.trim();
    if (fill) assert.equal(fill, 'none');
  }
});
