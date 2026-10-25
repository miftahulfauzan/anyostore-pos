const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const login = fs.readFileSync(path.join(root, 'app', 'login', 'page.js'), 'utf8');

test('dark POS keeps the workspace canvas and product tiles on dark surfaces', () => {
  assert.match(css, /\.dark \.pos-standalone\s*\{[^}]*background:\s*var\(--background\)/s);
  assert.match(css, /\.dark \.pos-workspace\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.dark \.pos-standalone \.product-tile\s*\{[^}]*border-color:\s*#5a8bbf[^}]*background:\s*var\(--surface-primary\)/s);
  assert.match(css, /\.dark \.pos-standalone \.product-tile\s+span,\s*\.dark \.pos-standalone \.product-tile\s+small,\s*\.dark \.pos-standalone \.pos-photo-placeholder\s*\{[^}]*color:\s*var\(--text-muted\)/s);
});

test('dark login uses a readable surface and theme-aware mode buttons', () => {
  assert.match(css, /\.dark \.login-page\s*\{[^}]*background:\s*var\(--background\)/s);
  assert.match(css, /\.dark \.login\s*\{[^}]*background:\s*var\(--surface-primary\)/s);
  assert.match(css, /\.dark \.login-mode-button:not\(\.selected\)\s*\{[^}]*background:\s*var\(--surface-secondary\)[^}]*color:\s*var\(--text-primary\)[^}]*border-color:\s*#5a8bbf/s);
  assert.match(login, /className={`login-mode-button\$\{mode === 'password' \? ' selected' : ''\}`}/);
  assert.doesNotMatch(login, /const modeButton = \(active\) =>/);
});
