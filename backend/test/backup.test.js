const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { createBackup, validateBackup, streamLegacyResponse } = require('../src/backup');
const { restoreBackup, assertIsolatedTarget } = require('../src/backup-restore');

const ddl = (name) => `CREATE TABLE \`${name}\` (\`id\` bigint NOT NULL) ENGINE=InnoDB`;
function source(tables, { failTable, afterRows, engine = 'InnoDB' } = {}) {
  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('information_schema.TABLES')) return [Object.keys(tables).sort().map(name => ({ name, engine, type: 'BASE TABLE' }))];
      if (sql.includes('information_schema.TRIGGERS') || sql.includes('information_schema.ROUTINES') || sql.includes('information_schema.EVENTS')) return [[]];
      if (sql.startsWith('SHOW CREATE TABLE')) { const name = sql.match(/`([^`]+)`/)[1]; return [[{ 'Create Table': ddl(name) }]]; }
      if (sql.startsWith('SHOW FULL COLUMNS')) { const name = sql.match(/`([^`]+)`/)[1]; return [Object.keys(tables[name][0] || { id: 0 }).map(Field => ({ Field, Extra: '' }))]; }
      if (sql.startsWith('SELECT COUNT(*)')) { const name = sql.match(/`([^`]+)`/)[1]; return [[{ count: String(tables[name].length) }]]; }
      return [[]];
    },
    connection: {
      query(options) {
        const name = options.sql.match(/`([^`]+)`/)[1];
        assert.equal(options.dateStrings, true);
        assert.equal(options.bigNumberStrings, true);
        assert.doesNotMatch(options.sql, /LIMIT/);
        return { stream: () => Readable.from((async function* () {
          if (name === failTable) throw new Error('secret SQL/password should not escape');
          for (const row of tables[name]) yield row;
          if (afterRows) await afterRows(name);
        })()) };
      },
    },
    release() { calls.push('RELEASE'); },
    destroy() { calls.push('DESTROY'); },
  };
  return { calls, getConnection: async () => connection };
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anyostore-backup-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const uploadsDir = path.join(root, 'uploads');
  await fs.mkdir(path.join(uploadsDir, 'products'), { recursive: true });
  return { root, uploadsDir, tempRoot: root };
}

test('complete snapshot exports 10037 rows, all tables and disk media, preserving legacy JSON', async (t) => {
  const dirs = await workspace(t);
  const photo = Buffer.alloc(150001, 0xf1);
  await fs.writeFile(path.join(dirs.uploadsDir, 'products/a.jpg'), photo);
  const db = source({ transactions: Array.from({ length: 10037 }, (_, id) => ({ id, amount: '123.45' })),
    product_photos: [{ id: 1, path: '/uploads/products/a.jpg' }],
    store_settings: [{ key: 'daily_email_api_key', value: 'private-key' }] });
  const result = await createBackup({ db, ...dirs, branchId: 2, mediaStorage: 'disk' });
  t.after(result.cleanup);
  const parsed = JSON.parse(await fs.readFile(result.filePath, 'utf8'));
  assert.equal(parsed.tables.transactions.length, 10037);
  assert.equal(parsed.tables.store_settings[0].value, '');
  assert.equal(parsed.manifest.tables.length, 3);
  assert.equal(parsed.manifest.complete, true);
  assert.deepEqual(parsed.manifest.errors, []);
  assert.equal(parsed.manifest.media[0].size_bytes, photo.length);
  assert.ok(db.calls.some(sql => sql.includes('WITH CONSISTENT SNAPSHOT')));
  assert.ok(db.calls.indexOf('COMMIT') < db.calls.indexOf('DESTROY'));
  const checked = await validateBackup(result.filePath);
  assert.equal(checked.manifest.total_rows, 10039);
  let body = '';
  for await (const chunk of streamLegacyResponse(result)) body += chunk;
  const legacy = JSON.parse(body);
  assert.equal(legacy.data.download, await fs.readFile(result.filePath, 'utf8'));
  assert.equal(legacy.data.size_bytes, Buffer.byteLength(legacy.data.download));
  assert.deepEqual(legacy.data.truncated_tables, []);
});

test('table failure aborts snapshot, cleans partial files and does not expose SQL secrets', async (t) => {
  const dirs = await workspace(t);
  const db = source({ orders: [{ id: 1 }] }, { failTable: 'orders' });
  await assert.rejects(createBackup({ db, ...dirs }), err => !err.message.includes('secret') && /backup|snapshot/i.test(err.message));
  assert.ok(db.calls.includes('ROLLBACK'));
  assert.deepEqual(await fs.readdir(dirs.root), ['uploads']);
});

test('snapshot refuses unsupported engines and missing referenced media', async (t) => {
  const dirs = await workspace(t);
  await assert.rejects(createBackup({ db: source({ a: [] }, { engine: 'MyISAM' }), ...dirs }), /InnoDB/);
  await assert.rejects(createBackup({ db: source({ product_photos: [{ path: '/uploads/products/missing.jpg' }] }), ...dirs }), /media/i);
});

test('disk file changed during the DB snapshot fails instead of claiming consistency', async (t) => {
  const dirs = await workspace(t);
  const file = path.join(dirs.uploadsDir, 'products/a.jpg');
  await fs.writeFile(file, 'before');
  const db = source({ products: [{ id: 1 }] }, { afterRows: () => fs.writeFile(file, 'after!') });
  await assert.rejects(createBackup({ db, ...dirs }), /media/i);
});

test('database media binary values and exact dates/bigints survive validation', async (t) => {
  const dirs = await workspace(t);
  const db = source({ media_files: [{ key: 'products/a.jpg', data: Buffer.from([0, 128, 255]), content_type: 'image/jpeg' }],
    product_photos: [{ path: '/uploads/products/a.jpg', id: '9223372036854775807', created_at: '2026-09-08 23:59:59.123456' }] });
  const result = await createBackup({ db, ...dirs, mediaStorage: 'database' });
  t.after(result.cleanup);
  assert.equal((await validateBackup(result.filePath)).manifest.media_storage, 'database');
  const data = JSON.parse(await fs.readFile(result.filePath, 'utf8'));
  assert.equal(data.tables.product_photos[0].id, '9223372036854775807');
  assert.equal(data.tables.media_files[0].data.base64, 'AID/');
});

test('traversal paths and symlinks fail export', async (t) => {
  const dirs = await workspace(t);
  await assert.rejects(createBackup({ db: source({ product_photos: [{ path: '/uploads/../escape' }] }), ...dirs }), /path|jalur/i);
  await fs.symlink(dirs.root, path.join(dirs.uploadsDir, 'link'));
  await assert.rejects(createBackup({ db: source({ a: [] }), ...dirs }), /symlink|media/i);
});

test('integrity validation rejects changed rows, media, manifest, traversal and truncation', async (t) => {
  const dirs = await workspace(t);
  await fs.writeFile(path.join(dirs.uploadsDir, 'products/a.jpg'), 'photo');
  const result = await createBackup({ db: source({ a: [{ id: 17 }] }), ...dirs });
  t.after(result.cleanup);
  const original = await fs.readFile(result.filePath, 'utf8');
  for (const changed of [original.replace('"id":17', '"id":18'), original.replace('cGhvdG8=', 'Y2hhbmdl'),
    original.replace('"complete":true', '"complete":false'), original.replaceAll('products/a.jpg', '../escape'), original.slice(0, -10)]) {
    const file = path.join(dirs.root, 'bad.json');
    await fs.writeFile(file, changed);
    await assert.rejects(validateBackup(file));
  }
});

function target(tables, { failInsert = false, nonempty = false } = {}) {
  const inserted = Object.fromEntries(Object.keys(tables).map(name => [name, []]));
  const calls = [];
  return { inserted, calls, async query(sql, args) {
    calls.push(sql);
    if (sql.startsWith('SELECT DATABASE()')) return [[{ name: 'anyostore_restore_test' }]];
    if (sql.includes('information_schema.TABLES')) return [Object.keys(tables).sort().map(name => ({ name, engine: 'InnoDB', type: 'BASE TABLE' }))];
    if (sql.startsWith('SHOW CREATE TABLE')) { const name = sql.match(/`([^`]+)`/)[1]; return [[{ 'Create Table': ddl(name) }]]; }
    if (sql.startsWith('SELECT COUNT(*)')) { const name = sql.match(/`([^`]+)`/)[1]; return [[{ count: nonempty ? 1 : inserted[name].length }]]; }
    if (sql.startsWith('INSERT INTO')) {
      if (failInsert) throw new Error('password and sensitive SQL');
      const name = sql.match(/`([^`]+)`/)[1]; inserted[name].push(args); return [{ affectedRows: 1 }];
    }
    return [[]];
  } };
}
const isolated = { host: '127.0.0.1', database: 'anyostore_restore_test', confirmDatabase: 'anyostore_restore_test', isolated: true };

test('restore guard rejects production, remote, ambiguous or unconfirmed targets', () => {
  assert.doesNotThrow(() => assertIsolatedTarget(isolated));
  for (const options of [{ ...isolated, host: 'db.example.com' }, { ...isolated, database: 'pos_pakaian' },
    { ...isolated, confirmDatabase: '' }, { ...isolated, isolated: false }, { ...isolated, nodeEnv: 'production' }]) {
    assert.throws(() => assertIsolatedTarget(options));
  }
});

test('mock isolated restore dry-run does not connect; apply verifies counts and restores disk bytes', async (t) => {
  const dirs = await workspace(t);
  await fs.writeFile(path.join(dirs.uploadsDir, 'products/a.jpg'), 'disk photo');
  const tables = { a: Array.from({ length: 10001 }, (_, id) => ({ id })) };
  const result = await createBackup({ db: source(tables), ...dirs });
  t.after(result.cleanup);
  const dry = await restoreBackup({ filePath: result.filePath, connect: () => assert.fail('dry-run must not connect') });
  assert.equal(dry.applied, false);
  const conn = target(tables);
  const mediaDir = path.join(dirs.root, 'restored-uploads');
  const applied = await restoreBackup({ filePath: result.filePath, apply: true, target: isolated, connection: conn, mediaDir });
  assert.equal(applied.applied, true);
  assert.equal(conn.inserted.a.length, 10001);
  assert.equal(await fs.readFile(path.join(mediaDir, 'products/a.jpg'), 'utf8'), 'disk photo');
  assert.ok(conn.calls.includes('COMMIT'));
});

test('restore rejects existing rows/files and rolls back failed inserts without exposing secrets', async (t) => {
  const dirs = await workspace(t);
  const tables = { a: [{ id: 1 }] };
  const result = await createBackup({ db: source(tables), ...dirs });
  t.after(result.cleanup);
  await assert.rejects(restoreBackup({ filePath: result.filePath, apply: true, target: isolated, connection: target(tables, { nonempty: true }), mediaDir: path.join(dirs.root, 'new') }), /empty|kosong/i);
  await assert.rejects(restoreBackup({ filePath: result.filePath, apply: true, target: isolated, connection: target(tables), mediaDir: dirs.uploadsDir }), /exist|new|baru|kosong/i);
  const conn = target(tables, { failInsert: true });
  await assert.rejects(restoreBackup({ filePath: result.filePath, apply: true, target: isolated, connection: conn, mediaDir: path.join(dirs.root, 'failed') }), error => !error.message.includes('password'));
  assert.ok(conn.calls.includes('ROLLBACK'));
  await assert.rejects(fs.access(path.join(dirs.root, 'failed')));
});

test('database media restores raw and stored-base64 blobs without changing bytes', async (t) => {
  const dirs = await workspace(t);
  const binary = Buffer.from([0, 128, 255, 10]);
  const tables = { media_files: [{ key: 'products/raw.jpg', content_type: 'image/jpeg', data: binary },
    { key: 'products/encoded.jpg', content_type: 'image/jpeg;base64', data: Buffer.from(binary.toString('base64')) }] };
  const result = await createBackup({ db: source(tables), ...dirs, mediaStorage: 'database' });
  t.after(result.cleanup);
  const conn = target(tables);
  await restoreBackup({ filePath: result.filePath, apply: true, target: isolated, connection: conn, mediaDir: path.join(dirs.root, 'db-media') });
  assert.deepEqual(conn.inserted.media_files[0][2], binary);
  assert.equal(conn.inserted.media_files[1][2].toString(), binary.toString('base64'));
});

test('corrupt backup cannot connect or create destination on apply', async (t) => {
  const dirs = await workspace(t);
  const filePath = path.join(dirs.root, 'bad.json');
  await fs.writeFile(filePath, '{"tables":{}}');
  const mediaDir = path.join(dirs.root, 'must-not-exist');
  await assert.rejects(restoreBackup({ filePath, apply: true, target: isolated, connect: () => assert.fail('must validate before connecting'), mediaDir }));
  await assert.rejects(fs.access(mediaDir));
});

test('CLI dry-run ignores application DB env; apply requires separate confirmed local credentials', () => {
  const { parseArgs } = require('../scripts/restore-backup');
  const env = { DB_HOST: 'production', DB_NAME: 'pos_pakaian', DB_PASSWORD: 'secret' };
  assert.equal(parseArgs(['--file', '/tmp/backup.json'], env).apply, false);
  assert.throws(() => parseArgs(['--file', '/tmp/backup.json', '--apply'], env));
  assert.throws(() => parseArgs(['--file', '/tmp/backup.json', '--unknown'], env));
  const options = parseArgs(['--file', '/tmp/backup.json', '--apply', '--isolated', '--confirm-database', isolated.database,
    '--media-dir', '/tmp/restored-test-media'], { ...env, RESTORE_DB_HOST: isolated.host, RESTORE_DB_NAME: isolated.database,
    RESTORE_DB_USER: 'restore', RESTORE_DB_PASSWORD: 'test' });
  assert.equal(options.target.host, '127.0.0.1');
});
