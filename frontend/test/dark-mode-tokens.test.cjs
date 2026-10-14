const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin dark theme applies semantic tokens without matching serialized inline colors', () => {
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.dark \.app-main :where\(h1, h2, h3, h4, p, span, strong, small, label, th, td, li, dt, dd, legend, summary\) \{ color: var\(--text-primary\) !important; \}/);
  assert.doesNotMatch(css, /\[style\*="color:/);
});
