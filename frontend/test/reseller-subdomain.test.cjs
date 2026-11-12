const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const middleware = read('middleware.js');
const caddy = fs.readFileSync(path.join(repo, 'deploy', 'Caddyfile'), 'utf8');
const release = fs.readFileSync(path.join(repo, 'scripts', 'deploy', 'release.sh'), 'utf8');
const landing = read('app/LandingClient.js');
const detail = read('app/produk/[id]/ProdukDetailClient.js');

test('reseller memakai subdomain sendiri', () => {
  assert.match(middleware, /reseller\.anyostore\.my\.id/);
  assert.match(caddy, /reseller\.\{\$APP_DOMAIN\}/);
  // www tetap ke landing grosir.
  assert.match(caddy, /www\.\{\$APP_DOMAIN\}/);
});

test('host reseller menampilkan landing reseller di root', () => {
  assert.match(middleware, /url\.pathname = '\/reseller'/);
  assert.match(middleware, /NextResponse\.rewrite/);
});

test('panel staf di subdomain reseller dialihkan ke domain utama', () => {
  assert.match(middleware, /isStaffPath/);
  assert.match(middleware, /https:\/\/anyostore\.my\.id/);
  assert.match(middleware, /\/login/);
  assert.match(middleware, /\/pos/);
});

test('logo landing mengikuti jalur, bukan selalu ke root', () => {
  assert.match(landing, /href=\{basePath\}/);
  assert.match(read('app/reseller/page.js'), /basePath="\/reseller"/);
});

test('detail produk kembali ke katalog sesuai domain', () => {
  assert.match(detail, /catalogHref/);
  assert.match(detail, /hostname\.startsWith\('reseller\.'\)/);
});

test('deploy memverifikasi subdomain reseller', () => {
  assert.match(release, /verify_reseller_endpoint/);
  assert.match(release, /reseller\.\$\{domain\}/);
});
