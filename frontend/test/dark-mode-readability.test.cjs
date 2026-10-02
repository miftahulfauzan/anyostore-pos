const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

test('dark theme maps shared operational text and surfaces to dark tokens', () => {
  assert.match(css, /\.dark\s*\{[^}]*--ui-ink:\s*var\(--foreground\)/s);
  assert.match(css, /\.dark\s*\{[^}]*--ui-bg:\s*var\(--background\)/s);
  assert.match(css, /\.dark\s*\{[^}]*--ui-surface:\s*var\(--card\)/s);
});

test('dark theme corrects high-level text and keeps semantic status and focus visible', () => {
  assert.match(css, /\.dark\s+\.app-main\s+:where\(h1,\s*h2,\s*h3,\s*h4,\s*p,\s*span,\s*strong,\s*small,\s*label,\s*th,\s*td,\s*li,\s*dt,\s*dd,\s*legend,\s*summary\)/s);
  assert.match(css, /\.dark\s+:is\(button,\s*a,\s*input,\s*select,\s*textarea\):focus-visible/);
  assert.match(css, /\.dark\s+\.app-main\s+\.negative/);
  assert.match(css, /\.dark\s+\.app-main\s+\.positive/);
});
