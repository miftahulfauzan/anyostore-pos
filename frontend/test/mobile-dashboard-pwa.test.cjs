/* eslint-disable no-undef */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = new URL('../', `file://${__dirname}/`);
const css = fs.readFileSync(new URL('app/globals.css', root), 'utf8');
const layout = fs.readFileSync(new URL('app/layout.js', root), 'utf8');
const readIfPresent = (relativePath) => {
  const url = new URL(relativePath, root);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
};
const register = readIfPresent('app/components/PwaRegister.js');
const manifestSource = readIfPresent('public/manifest.json');
const manifest = manifestSource ? JSON.parse(manifestSource) : {};
const serviceWorker = readIfPresent('public/sw.js');

test('mobile dashboard actions use a stable two-row grid', () => {
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.header-actions\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.header-actions\s*>\s*\.branch-switcher\s*\{[^}]*grid-column:\s*1/s);
  assert.match(css, /\.header-actions\s*>\s*\.theme-toggle\s*\{[^}]*grid-column:\s*2/s);
  assert.match(css, /\.header-actions\s*>\s*a\.button-link:first-of-type\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('mobile dashboard date filter keeps separator aligned and apply full width', () => {
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.dashboard-report-date-filter\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.dashboard-report-date-filter\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.dashboard-report-date-filter\s*>\s*span\s*\{[^}]*align-self:\s*end/s);
  assert.match(css, /\.dashboard-report-date-filter\s*>\s*button\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('web app exposes an installable iOS-compatible PWA shell', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/dashboard');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.theme_color, '#1E3A5F');
  assert.ok(manifest.icons.some((icon) => icon.src === '/icon.svg'));
  assert.match(layout, /manifest:\s*['"]\/manifest\.json['"]/);
  assert.match(layout, /appleWebApp:/);
  assert.match(layout, /<PwaRegister\s*\/>/);
  assert.match(register, /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]/);
  assert.match(serviceWorker, /event\.respondWith/);
  assert.match(serviceWorker, /\/api\//);
});
