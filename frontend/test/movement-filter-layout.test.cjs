const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', 'app');
const css = fs.readFileSync(path.join(app, 'globals.css'), 'utf8');
const page = fs.readFileSync(path.join(app, 'inventory/movements/page.js'), 'utf8');

test('stock movement filter separates the quick range from the date and activity fields', () => {
  assert.match(page, /className="movement-intro"/);
  assert.match(page, /className="movement-field movement-field--presets"/);
  assert.match(page, /className="movement-field movement-field--date"/);
  assert.match(page, /className="movement-field movement-field--type"/);
  assert.match(page, /className="movement-actions"/);
});

test('quick ranges occupy a full row without being forced into a vertical stack', () => {
  assert.match(css, /\.movement-filter\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.movement-field--presets\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /\.movement-field--presets\s+\.date-range-presets\s*\{[^}]*flex-direction:\s*row/);
  assert.doesNotMatch(css, /\.movement-field\s*>\s*div\s*\{[^}]*flex-direction:\s*column/);
});

test('filter fields reflow for narrow viewports and retain touch-sized controls', () => {
  assert.match(css, /\.movement-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.movement-filter\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(css, /@container\s*\(min-width:\s*940px\)[\s\S]*?\.movement-controls\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s+minmax\(180px,\s*\.85fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.movement-field--date\s*\{[^}]*grid-column:\s*auto/);
  assert.match(css, /\.movement-filter\s+\.date-range-presets button\s*\{[^}]*min-height:\s*44px/);
});
