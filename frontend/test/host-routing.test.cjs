const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const middleware = read('middleware.js');
const gateway = read('app/page.js');
const grosirPage = read('app/grosir/page.js');
const caddy = fs.readFileSync(path.join(repo, 'deploy', 'Caddyfile'), 'utf8');
const release = fs.readFileSync(path.join(repo, 'scripts', 'deploy', 'release.sh'), 'utf8');
const workflow = fs.readFileSync(path.join(repo, '.github', 'workflows', 'deploy.yml'), 'utf8');
const sitemap = read('app/sitemap.js');
const robots = read('app/robots.js');
const layout = read('app/layout.js');

test('tiga host dengan peran berbeda terdaftar di middleware dan Caddy', () => {
  assert.match(middleware, /export const APP_HOST = 'anyostore\.my\.id'/);
  assert.match(middleware, /export const GROSIR_HOST = 'grosir\.anyostore\.my\.id'/);
  assert.match(middleware, /export const RESELLER_HOST = 'reseller\.anyostore\.my\.id'/);
  assert.match(caddy, /grosir\.\{\$APP_DOMAIN\}/);
});

test('host grosir me-rewrite root ke katalog /grosir', () => {
  assert.match(middleware, /if \(isGrosirHost\) \{/);
  assert.match(middleware, /url\.pathname = '\/grosir';\s*return NextResponse\.rewrite\(url\);/s);
});

test('aplikasi staf hanya dilayani di domain utama', () => {
  assert.match(middleware, /if \(isStaffPath\(url\.pathname\)\) \{/);
  assert.match(middleware, /if \(!isAppHost\) return redirect\(`https:\/\/\$\{APP_HOST\}`/);
});

test('katalog lama di root dialihkan ke grosir, /reseller ke subdomain reseller', () => {
  assert.match(middleware, /if \(isCatalogPath\(url\.pathname\)\) return redirect\(`https:\/\/\$\{GROSIR_HOST\}`/);
  assert.match(middleware, /url\.pathname\.replace\(\/\^\\\/reseller\/, ''\)/);
  // www menuju domain utama.
  assert.match(middleware, /host === `www\.\$\{APP_HOST\}`/);
});

test('halaman pembeli reseller selalu di subdomain reseller', () => {
  assert.match(middleware, /if \(isBuyerPath\(url\.pathname\)\) \{/);
  assert.match(middleware, /return redirect\(`https:\/\/\$\{RESELLER_HOST\}`/);
});

test('root sekarang gateway, katalog grosir punya halaman sendiri', () => {
  assert.match(gateway, /grosir\.anyostore\.my\.id/);
  assert.match(gateway, /reseller\.anyostore\.my\.id/);
  assert.match(gateway, /Masuk staf/);
  assert.match(gateway, /\/api\/public\/settings/);
  assert.match(grosirPage, /<LandingClient/);
  assert.match(grosirPage, /canonical: 'https:\/\/grosir\.anyostore\.my\.id'/);
  // Root bukan lagi katalog grosir.
  assert.doesNotMatch(gateway, /LandingClient/);
});

test('sitemap dan robots mengikuti host', () => {
  assert.match(sitemap, /GROSIR_ORIGIN/);
  assert.match(sitemap, /RESELLER_ORIGIN/);
  assert.match(sitemap, /host\.startsWith\('grosir\.'\)/);
  assert.match(robots, /STAFF_PATHS/);
  assert.match(robots, /host\.startsWith\('reseller\.'\)/);
});

test('deploy memverifikasi host grosir (VPS + publik)', () => {
  assert.match(release, /verify_grosir_endpoint \/version/);
  assert.match(release, /grosir\.\$\{domain\}/);
  assert.match(workflow, /EXPECTED_GROSIR_DOMAIN=grosir\.anyostore\.my\.id/);
  assert.match(workflow, /verify_public_endpoint grosir\.anyostore\.my\.id \/version/);
});

test('meta verifikasi Google Search Console terpasang di semua host', () => {
  assert.match(layout, /verification: \{ google: '-58k2SOD13P7wgvMSBgqC9K9J7Zskjn2jFh8X7kTRl0' \}/);
});
