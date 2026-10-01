const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mobileUi = source('mobile/lib/src/task_ui.dart');

test('visible app source contains no em dash punctuation', () => {
  const walk = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(relative);
      return /\.(?:js|jsx|dart)$/.test(entry.name) ? [relative] : [];
    });
  const files = [...walk('frontend/app'), ...walk('mobile/lib/src')];
  for (const file of files) {
    const withoutComments = source(file)
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(withoutComments.includes('—'), false, `${file} contains an em dash`);
  }
});

test('customer list distinguishes loading, empty, error, and retry states', () => {
  const page = source('frontend/app/customers/page.js');
  assert.match(page, /const \[listLoading, setListLoading\] = useState\(true\)/);
  assert.match(page, /const \[listError, setListError\] = useState\(''\)/);
  assert.match(page, /Memuat daftar pelanggan/);
  assert.match(page, /Gagal memuat daftar pelanggan/);
  assert.match(page, /Coba lagi/);
  assert.match(page, /Belum ada pelanggan/);
});

test('owner aggregate is identified by a store icon, not a decorative sparkle', () => {
  const page = source('frontend/app/dashboard/page.js');
  assert.match(page, /\bStore\b/);
  assert.match(page, /<Store aria-hidden="true"/);
  assert.doesNotMatch(page, /<Sparkles aria-hidden="true"/);
});

test('web data surfaces use borders rather than a shared floating shadow', () => {
  const css = source('frontend/app/globals.css');
  assert.match(css, /\.panel,\s*\.metric-card,\s*\.store-summary-grid article,\s*\.inventory-product,\s*\.login\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.dark \.panel,\s*\.dark \.metric-card,\s*\.dark \.store-summary-grid article,\s*\.dark \.inventory-product,\s*\.dark \.login\s*\{[^}]*box-shadow:\s*none/s);
  const cardStart = mobileUi.indexOf('class GlassCard');
  const navStart = mobileUi.indexOf('class GlassNavBar', cardStart);
  assert.notEqual(cardStart, -1);
  assert.notEqual(navStart, -1);
  assert.doesNotMatch(mobileUi.slice(cardStart, navStart), /boxShadow:/);
});

test('mobile stock status colors meet WCAG AA contrast', () => {
  const color = (token) => {
    const match = mobileUi.match(new RegExp(`const ${token} = Color\\(0xff([0-9a-fA-F]{6})\\)`));
    assert.ok(match, `missing mobile color token ${token}`);
    return match[1].match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  };
  const luminance = (rgb) => rgb
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background) => {
    const a = luminance(color(foreground));
    const b = luminance(color(background));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  for (const [foreground, background] of [
    ['kTaskStockGood', 'kTaskStockGoodSurface'],
    ['kTaskStockLow', 'kTaskStockLowSurface'],
    ['kTaskStockEmpty', 'kTaskStockEmptySurface'],
  ]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} fails 4.5:1`);
  }
});

test('design guide matches the approved denim and cream direction', () => {
  const design = source('DESIGN.md');
  const css = source('frontend/app/globals.css');
  assert.match(design, /primary:\s*"#1E3A5F"/);
  assert.match(design, /background:\s*"#F5F1EA"/);
  assert.match(design, /DM Sans/);
  assert.doesNotMatch(design, /#db2777|IBM Plex Mono/);
  assert.match(css, /--ui-primary:\s*#1e3a5f/);
  assert.match(css, /--ui-accent:\s*#2e5d8f/);
});
