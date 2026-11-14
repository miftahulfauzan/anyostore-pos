const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const moduleSource = read('app/lib/marketplace.js').replace(/^export /gm, '');
const { shopeeSearchUrl, tiktokShopUrl, marketplaceLinks, marketplaceKeyword, showMarketplaceOnCards } =
  new Function(`${moduleSource}
    return { shopeeSearchUrl, tiktokShopUrl, marketplaceLinks, marketplaceKeyword, showMarketplaceOnCards };`)();

const landing = read('app/LandingClient.js');
const detail = read('app/produk/[id]/ProdukDetailClient.js');
const storeSettings = read('app/store-settings/page.js');
const publicRoute = fs.readFileSync(path.join(repo, 'backend', 'src', 'routes', 'public.js'), 'utf8');
const settingsRoute = fs.readFileSync(path.join(repo, 'backend', 'src', 'routes', 'settings.js'), 'utf8');
const migration = fs.readFileSync(path.join(repo, 'backend', 'migrations', '20261116_marketplace_links.sql'), 'utf8');

test('Shopee memakai pencarian di dalam toko (shop-scoped)', () => {
  assert.equal(
    shopeeSearchUrl('5046365', 'Kemeja AB83 Salur'),
    'https://shopee.co.id/shop/5046365/search?keyword=Kemeja%20AB83%20Salur',
  );
  // Nama dengan tanda hubung & garis miring tetap di-encode aman.
  assert.equal(
    shopeeSearchUrl('5046365', 'A101-BLAZE / Biru'),
    'https://shopee.co.id/shop/5046365/search?keyword=A101-BLAZE%20%2F%20Biru',
  );
  // Tanpa shop id -> tombol tidak dibuat.
  assert.equal(shopeeSearchUrl('', 'B08'), '');
  assert.equal(shopeeSearchUrl('abc', 'B08'), '');
});

test('kata kunci Shopee memakai kode produk (varian dibuang)', () => {
  const kasus = {
    'AB83-Stripe': 'AB83',
    'A116 Zipper Boxy': 'A116',
    'AT65 JUMBO': 'AT65',
    'AT77 BORDIR': 'AT77',
    'AT77-BLAZE': 'AT77',
    'AT92-BLAZE': 'AT92',
    'AB12 ON MODEL': 'AB12',
    'A101-BLAZE / Biru': 'A101',
    'ROK-03': 'ROK',
    'ROK-02': 'ROK',
    'B-05': 'B05',
    'B08': 'B08',
    'AC010': 'AC010',
    'ST01': 'ST01',
    'CELANA KATUN': 'CELANA KATUN',
    '': '',
  };
  for (const [name, expected] of Object.entries(kasus)) {
    assert.equal(marketplaceKeyword(name), expected, `kata kunci untuk ${JSON.stringify(name)}`);
  }
});

test('TikTok memakai profil toko, menerima URL atau username', () => {
  assert.equal(tiktokShopUrl('https://www.tiktok.com/@anyostore'), 'https://www.tiktok.com/@anyostore');
  assert.equal(tiktokShopUrl('@anyostore'), 'https://www.tiktok.com/@anyostore');
  assert.equal(tiktokShopUrl('anyostore'), 'https://www.tiktok.com/@anyostore');
  assert.equal(tiktokShopUrl(''), '');
});

test('marketplaceLinks menggabungkan keduanya dan hormati toggle kartu', () => {
  const links = marketplaceLinks(
    { marketplace_shopee_shop_id: '5046365', marketplace_tiktok_shop_url: 'https://www.tiktok.com/@anyostore' },
    'B08',
  );
  assert.equal(links.shopee, 'https://shopee.co.id/shop/5046365/search?keyword=B08');
  // Nama ber-varian otomatis dipangkas ke kode produk.
  assert.equal(
    marketplaceLinks({ marketplace_shopee_shop_id: '5046365' }, 'AB12 ON MODEL').shopee,
    'https://shopee.co.id/shop/5046365/search?keyword=AB12',
  );
  assert.equal(
    marketplaceLinks({ marketplace_shopee_shop_id: '5046365' }, 'ROK-03').shopee,
    'https://shopee.co.id/shop/5046365/search?keyword=ROK',
  );
  assert.equal(links.tiktok, 'https://www.tiktok.com/@anyostore');
  assert.equal(showMarketplaceOnCards({ marketplace_show_on_cards: 'true' }), true);
  assert.equal(showMarketplaceOnCards({ marketplace_show_on_cards: 'false' }), false);
  assert.equal(showMarketplaceOnCards({}), false);
});

test('kartu produk dan detail memakai builder yang sama', () => {
  assert.match(landing, /from '\.\/lib\/marketplace'/);
  assert.match(landing, /marketplaceLinks\(settings, p\.name\)/);
  assert.match(landing, /showMarketplaceOnCards\(settings\)/);
  assert.match(landing, /rel="noopener noreferrer nofollow"/);
  assert.match(detail, /from '\.\.\/\.\.\/lib\/marketplace'/);
  assert.match(detail, /marketplaceLinks\(settings \|\| \{\}, product\.name\)/);
  assert.match(detail, /Beli di Shopee/);
  assert.match(detail, /Lihat di TikTok/);
});

test('setelan marketplace bisa diubah dari Setelan Toko dan dikirim ke publik', () => {
  for (const key of ['marketplace_shopee_shop_id', 'marketplace_tiktok_shop_url', 'marketplace_show_on_cards']) {
    assert.match(settingsRoute, new RegExp(key), `${key} harus diizinkan`);
    assert.match(storeSettings, new RegExp(key), `${key} harus ada di form`);
    assert.match(publicRoute, new RegExp(key), `${key} harus dikirim ke katalog publik`);
  }
  // Nilai awal untuk cabang reseller (Anyo Blok B).
  assert.match(migration, /\(2, 'marketplace_shopee_shop_id', '5046365'\)/);
  assert.match(migration, /\(2, 'marketplace_tiktok_shop_url', 'https:\/\/www\.tiktok\.com\/@anyostore'\)/);
});
