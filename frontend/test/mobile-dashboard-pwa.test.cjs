/* eslint-disable no-undef */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = new URL('../', `file://${__dirname}/`);
const css = fs.readFileSync(new URL('app/globals.css', root), 'utf8');
const layout = fs.readFileSync(new URL('app/layout.js', root), 'utf8');
const appShell = fs.readFileSync(new URL('app/components/AppShell.js', root), 'utf8');
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
  assert.match(css, /\.header-action-links\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(css, /\.header-action-links\s*>\s*a\.button-link\s*\{[^}]*width:\s*100%/s);
  assert.match(appShell, /className="header-action-links">\{actions\}<\/div>/);
  const finalMobileLayoutStart = css.lastIndexOf('/* Final mobile dashboard layout */');
  assert.notEqual(finalMobileLayoutStart, -1);
  const finalMobileLayout = css.slice(finalMobileLayoutStart);
  assert.match(finalMobileLayout, /\.header-actions\s*\{[^}]*display:\s*grid/s);
  assert.match(finalMobileLayout, /\.header-action-links\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.doesNotMatch(finalMobileLayout, /\.header-actions\s*\{[^}]*display:\s*flex/s);
});

test('mobile dashboard content stays centered within the viewport', () => {
  const finalMobileLayoutStart = css.lastIndexOf('/* Final mobile dashboard layout */');
  const finalMobileLayout = css.slice(finalMobileLayoutStart);
  assert.match(finalMobileLayout, /\.app-content\s*\{[^}]*justify-items:\s*center/s);
  assert.match(finalMobileLayout, /\.app-content\s*>\s*\*\s*\{[^}]*width:\s*min\(100%\s*,\s*1180px\)/s);
  assert.match(finalMobileLayout, /\.app-content\s*>\s*\*\s*\{[^}]*margin-inline:\s*auto/s);
});

test('mobile dashboard date filter keeps separator aligned and apply full width', () => {
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.dashboard-report-date-filter\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.dashboard-report-date-filter\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.dashboard-report-date-filter\s*>\s*span\s*\{[^}]*align-self:\s*end[^}]*justify-self:\s*center[^}]*background:\s*#eef3f8[^}]*color:\s*#1e3a5f/s);
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

test('mobile sidebar backdrop stays translucent and closes on outside tap', () => {
  const finalMobileLayoutStart = css.lastIndexOf('/* Final mobile dashboard layout */');
  const finalMobileLayout = css.slice(finalMobileLayoutStart);
  assert.match(appShell, /className=\{`sidebar-backdrop \$\{mobileNavOpen \? 'visible' : ''\}`\}/);
  assert.match(appShell, /onClick=\{\(\) => setMobileNavOpen\(false\)\}/);
  assert.match(finalMobileLayout, /\.sidebar-backdrop\s*\{[^}]*background:\s*rgba\(15,\s*23,\s*42,\s*\.58\)\s*!important/s);
  assert.match(finalMobileLayout, /\.sidebar-backdrop\.visible\s*\{[^}]*pointer-events:\s*auto\s*!important/s);
});
