const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');

// iOS WebKit (Safari + Chrome di iPhone) menghitung `width:100%` pada
// input[type=date] yang punya padding lebih lebar dari kotaknya
// (WebKit bug 301648). Akibatnya baris filter tanggal meluber keluar kartu
// dan menabrak elemen tetangga, sementara di Chrome desktop normal.
test('input tanggal diberi perbaikan khusus iOS WebKit', () => {
  assert.match(
    css,
    /@supports\s*\(-webkit-touch-callout:\s*none\)\s*\{[\s\S]*?input\[type="date"\][\s\S]*?-webkit-appearance:\s*none;[\s\S]*?appearance:\s*none;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/,
    'blok @supports iOS harus menetralkan appearance dan lebar input tanggal',
  );
});

test('perbaikan iOS tidak bocor ke browser lain', () => {
  const beforeSupports = css.split('@supports (-webkit-touch-callout: none)')[0];
  assert.doesNotMatch(
    beforeSupports,
    /input\[type="date"\][^{]*\{[^}]*appearance:\s*none/,
    'appearance:none hanya boleh ada di dalam blok @supports iOS',
  );
});

test('filter tanggal dashboard memakai tiga kolom yang bisa menyusut', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*820px\)[\s\S]*?\.dashboard-report-date-filter\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*38px\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(css, /\.dashboard-report-date-filter label\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.dashboard-report-date-filter input\s*\{[^}]*min-width:\s*0/s);
});
