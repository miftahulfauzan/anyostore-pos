const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'test-db';
process.env.DB_USER ||= 'test-user';
process.env.DB_PASSWORD ||= 'test-password';
process.env.DB_NAME ||= 'test-db';
process.env.JWT_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const mediaPath = require.resolve('../src/media-storage');
require.cache[mediaPath] = {
  id: mediaPath,
  filename: mediaPath,
  loaded: true,
  exports: {
    copyMediaFile: async (file) => file,
    removeMedia: async () => {},
  },
};

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async () => [[]],
    getConnection: async () => ({ execute: async () => [[]], release: () => {} }),
    end: async () => {},
  },
};

const {
  normalizeName,
  stripBranchSkuPrefix,
  parseArgs,
  pairProducts,
  applyPhotoSync,
} = require('../scripts/sync-product-photos');

function fakeConnection({ totalRows = 0 } = {}) {
  const statements = [];
  const connection = {
    statements,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    execute: async (statement, params) => {
      statements.push({ statement, params });
      const sql = statement.trim();
      if (/^INSERT INTO product_photos/i.test(sql)) return [{ insertId: statements.length }];
      if (/^DELETE FROM product_photos/i.test(sql)) return [{ affectedRows: 2 }];
      if (/COUNT\(\*\) AS total FROM product_photos/i.test(sql)) return [[{ total: totalRows }]];
      return [[]];
    },
  };
  return connection;
}

function samplePlan(overrides = {}) {
  return [
    {
      source: { id: 10, name: 'Kaos Polos Hitam', sku: 'B5-KAOS-01' },
      target: { id: 20, name: 'Kaos Polos Hitam', sku: 'B3-KAOS-01' },
      matchedBy: 'nama',
      sourcePhotos: [
        { id: 1, path: '/uploads/products/src-1.jpg', is_primary: 1, sort_order: 0, transform: '1.2,3,-4' },
        { id: 2, path: '/uploads/products/src-2.jpg', is_primary: 0, sort_order: 1, transform: null },
      ],
      targetPhotos: [
        { id: 9, path: '/uploads/products/old-1.jpg' },
        { id: 8, path: '/uploads/products/old-2.jpg' },
      ],
      ...overrides,
    },
  ];
}

test('normalizeName hanya mengabaikan huruf besar/kecil dan spasi berlebih', () => {
  assert.equal(normalizeName('  Kaos   Polos  '), 'kaos polos');
  assert.equal(normalizeName('KAOS POLOS'), normalizeName('kaos polos'));
  // Normalisasi ketat: tanda hubung dan tanda baca tetap berbeda.
  assert.notEqual(normalizeName('Kaos A-104'), normalizeName('Kaos A 104'));
  assert.notEqual(normalizeName('Kaos (Salinan)'), normalizeName('Kaos'));
});

test('stripBranchSkuPrefix membuang prefix cabang hasil clone', () => {
  assert.equal(stripBranchSkuPrefix('B5-A104'), 'a104');
  assert.equal(stripBranchSkuPrefix('B-A104'), 'a104');
  assert.equal(stripBranchSkuPrefix('a104'), 'a104');
  assert.equal(stripBranchSkuPrefix(''), '');
});

test('parseArgs membaca --from/--to dan --apply', () => {
  const args = parseArgs(['--from', 'Blok B', '--to', 'Gudang Utama', '--apply']);
  assert.deepEqual(args, { from: 'Blok B', to: 'Gudang Utama', apply: true });
  assert.equal(parseArgs(['--from', 'A', '--to', 'B']).apply, false);
});

test('pasangan nama unik dipasangkan langsung', () => {
  const { pairs, ambiguous, sourceOnly, targetOnly } = pairProducts(
    [{ id: 1, name: 'Kaos Polos', sku: 'B5-K1' }],
    [{ id: 2, name: 'kaos  polos', sku: 'B3-K1' }],
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].matchedBy, 'nama');
  assert.equal(pairs[0].target.id, 2);
  assert.equal(ambiguous.length, 0);
  assert.equal(sourceOnly.length, 0);
  assert.equal(targetOnly.length, 0);
});

test('nama ganda diselesaikan lewat SKU tanpa prefix cabang', () => {
  const { pairs, ambiguous } = pairProducts(
    [
      { id: 1, name: 'Celana Denim', sku: 'B5-CL-30' },
      { id: 2, name: 'Celana Denim', sku: 'B5-CL-32' },
    ],
    [
      { id: 3, name: 'Celana Denim', sku: 'B3-CL-32' },
      { id: 4, name: 'Celana Denim', sku: 'B3-CL-30' },
    ],
  );
  assert.equal(ambiguous.length, 0);
  assert.equal(pairs.length, 2);
  assert.ok(pairs.every((pair) => pair.matchedBy === 'nama+sku'));
  const mapping = Object.fromEntries(pairs.map((pair) => [pair.source.id, pair.target.id]));
  assert.deepEqual(mapping, { 1: 4, 2: 3 });
});

test('nama ganda tanpa penyelesai SKU dilewati, bukan ditebak', () => {
  const { pairs, ambiguous } = pairProducts(
    [
      { id: 1, name: 'Celana Denim', sku: 'B5-CL-30' },
      { id: 2, name: 'Celana Denim', sku: 'B5-CL-32' },
    ],
    [{ id: 3, name: 'Celana Denim', sku: 'B3-CL-40' }],
  );
  assert.equal(pairs.length, 0);
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].target.length, 1);
});

test('nama berbeda (walau mirip) tidak dipasangkan', () => {
  const { pairs, sourceOnly, targetOnly } = pairProducts(
    [{ id: 1, name: 'Kaos A-104', sku: 'B5-A104' }],
    [{ id: 2, name: 'Kaos A 104', sku: 'B3-A104' }],
  );
  assert.equal(pairs.length, 0);
  assert.equal(sourceOnly.length, 1);
  assert.equal(targetOnly.length, 1);
});

test('applyPhotoSync hanya menulis ke product_photos dan menyimpan transform', async () => {
  const connection = fakeConnection({ totalRows: 0 });
  const removed = [];
  const copied = [];
  const stats = await applyPhotoSync({
    plan: samplePlan(),
    connection,
    copyFile: async (file) => {
      copied.push(file);
      return `/uploads/products/copy-${copied.length}.jpg`;
    },
    removeFile: async (file) => { removed.push(file); },
  });

  assert.equal(stats.products_updated, 1);
  assert.equal(stats.files_copied, 2);
  assert.equal(stats.rows_deleted, 2);
  assert.equal(stats.files_deleted, 2);
  assert.deepEqual(copied, ['/uploads/products/src-1.jpg', '/uploads/products/src-2.jpg']);
  assert.deepEqual(removed.sort(), ['/uploads/products/old-1.jpg', '/uploads/products/old-2.jpg']);

  const insert = connection.statements.find(({ statement }) => /^INSERT INTO product_photos/i.test(statement.trim()));
  assert.ok(insert, 'harus ada INSERT product_photos');
  // product_id, filename, path, is_primary, sort_order, transform
  assert.equal(insert.params[0], 20);
  assert.equal(insert.params[4], 0);
  assert.equal(insert.params[5], '1.2,3,-4');
  assert.match(insert.statement, /variant_id, `transform`\)/);
  assert.match(insert.statement, /VALUES \(\?, \?, \?, 'image', \?, \?, NULL, \?\)/);

  // Pengaman keras: tidak ada statement tulis selain product_photos dan tidak
  // ada yang menyentuh stok/harga/varian.
  const writes = connection.statements.filter(({ statement }) => !/^SELECT /i.test(statement.trim()));
  for (const { statement } of writes) {
    assert.match(statement.trim(), /^(INSERT INTO product_photos|DELETE FROM product_photos)/i);
    assert.doesNotMatch(statement, /\bUPDATE\b|\bstock\b|\bprice\b|\bcost\b/i);
  }
});

test('applyPhotoSync membiarkan foto target bila sumber tidak punya foto', async () => {
  const connection = fakeConnection();
  const stats = await applyPhotoSync({
    plan: samplePlan({ sourcePhotos: [] }),
    connection,
    copyFile: async () => '/uploads/products/unused.jpg',
    removeFile: async () => {},
  });

  assert.equal(stats.products_updated, 0);
  assert.equal(stats.skipped_no_source, 1);
  assert.equal(connection.statements.length, 0);
});

test('applyPhotoSync tidak menghapus foto lama saat penyalinan file gagal', async () => {
  const connection = fakeConnection();
  const removed = [];
  const stats = await applyPhotoSync({
    plan: samplePlan(),
    connection,
    // copyMediaFile mengembalikan path asal kalau file tidak terbaca.
    copyFile: async (file) => file,
    removeFile: async (file) => { removed.push(file); },
  });

  assert.equal(stats.products_updated, 0);
  assert.equal(stats.copy_failed.length, 2);
  assert.equal(connection.statements.filter(({ statement }) => /^DELETE /i.test(statement.trim())).length, 0);
  assert.equal(removed.length, 0);
});

test('applyPhotoSync rollback dan membuang file baru saat batch gagal', async () => {
  const connection = fakeConnection();
  let rolledBack = false;
  connection.rollback = async () => { rolledBack = true; };
  const removed = [];
  let copyCount = 0;

  await assert.rejects(
    applyPhotoSync({
      plan: samplePlan(),
      connection,
      copyFile: async () => {
        copyCount += 1;
        if (copyCount === 2) throw new Error('disk penuh');
        return `/uploads/products/copy-${copyCount}.jpg`;
      },
      removeFile: async (file) => { removed.push(file); },
    }),
    /disk penuh/,
  );

  assert.equal(rolledBack, true);
  assert.deepEqual(removed, ['/uploads/products/copy-1.jpg']);
});