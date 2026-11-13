const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'globals.css'),
  'utf8',
);

test('penutupan memakai kolom label dan nilai yang konsisten saat dicetak', () => {
  const summaryRule = css.match(/\.receipt-summary-row\s*\{[^}]*\}/)?.[0] || '';
  const valueRule = css.match(/\.receipt-summary-row b\s*\{[^}]*\}/)?.[0] || '';
  const infoRule = css.match(/\.receipt-invoice dl > div\s*\{[^}]*\}/)?.[0] || '';

  assert.match(summaryRule, /display:\s*grid/);
  assert.match(summaryRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/);
  assert.match(valueRule, /justify-self:\s*end/);
  assert.match(valueRule, /white-space:\s*nowrap/);
  assert.match(infoRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/);
});

test('lebar kertas cetak tidak bertambah karena padding', () => {
  const paperRules = [...css.matchAll(/\.receipt-paper\s*\{[^}]*\}/g)].map((match) => match[0]);
  const paperRule = paperRules.find((rule) => rule.includes('80mm')) || '';
  const printRules = [...css.matchAll(/@media print\s*\{[\s\S]*?\.receipt-paper\s*\{[^}]*\}/g)].map((match) => match[0]);
  const printRule = printRules.find((rule) => rule.includes('width: 80mm')) || '';

  assert.match(paperRule, /box-sizing:\s*border-box/);
  assert.match(printRule, /box-sizing:\s*border-box/);
});
