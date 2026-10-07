const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'app/globals.css'), 'utf8');
const rule = (selector) => [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g'))].at(-1)?.[1] || '';

test('product action links and buttons share a centered, thumb-sized icon box', () => {
  const action = rule('\\.product-actions \\.icon-action');
  assert.match(action, /display:\s*inline-flex/);
  assert.match(action, /align-items:\s*center/);
  assert.match(action, /justify-content:\s*center/);
  assert.match(action, /width:\s*44px/);
  assert.match(action, /height:\s*44px/);
  assert.match(action, /min-width:\s*44px/);
  assert.match(action, /min-height:\s*44px/);
  assert.match(action, /flex:\s*0 0 44px/);
});

test('icon focus remains visible without changing the button box', () => {
  assert.match(css, /button:focus-visible,\s*a:focus-visible[^\{]*\{[^}]*outline:\s*2px solid/);
  const action = rule('\\.product-actions \\.icon-action');
  assert.match(action, /box-sizing:\s*border-box/);
});
