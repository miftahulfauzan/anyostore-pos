const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

function block(source, selector) {
  const selectorIndex = source.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `Missing CSS selector: ${selector}`);
  const openingBrace = source.indexOf('{', selectorIndex);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  assert.fail(`Unclosed CSS block: ${selector}`);
}

test('short desktop sidebars use compact rows while keeping every group reachable', () => {
  const compact = block(css, '@media (min-width: 821px) and (max-height: 900px)');
  const warehouseLinks = block(compact, '.sidebar.sidebar-warehouse .side-nav a');
  const warehouseLabels = block(compact, '.sidebar.sidebar-warehouse .warehouse-nav-label');
  const navScroll = block(compact, '.sidebar .side-nav');

  assert.match(warehouseLinks, /min-height:\s*38px/);
  assert.match(warehouseLinks, /font-size:\s*13px/);
  assert.match(warehouseLabels, /padding:\s*4px 10px 5px/);
  assert.match(navScroll, /min-height:\s*0/);
  assert.match(navScroll, /flex:\s*1 1 auto/);
  assert.match(navScroll, /overflow-y:\s*auto/);
});

test('very short desktop screens tighten spacing further without hiding navigation', () => {
  const compact = block(css, '@media (min-width: 821px) and (max-height: 680px)');
  const warehouseLinks = block(compact, '.sidebar.sidebar-warehouse .side-nav a');
  const normalLinks = block(compact, '.sidebar .side-nav a');

  assert.match(warehouseLinks, /min-height:\s*34px/);
  assert.match(normalLinks, /min-height:\s*34px/);
  assert.doesNotMatch(compact, /display:\s*none/);
});
