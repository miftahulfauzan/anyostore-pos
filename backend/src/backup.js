// Backup JSON v2: one record per line, still ordinary JSON for existing clients.
// Memory is bounded by a database row/chunk plus schema and media-path metadata.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { StringDecoder } = require('node:string_decoder');

const FORMAT = 'anyostore-backup';
const CHUNK_SIZE = 64 * 1024;
const MAX_LINE_BYTES = 128 * 1024 * 1024;
const sensitiveSettingKeys = new Set(['daily_email_api_key']);
const hash = () => crypto.createHash('sha256');
const sha256 = data => hash().update(data).digest('hex');
const problem = message => Object.assign(new Error(message), { backupSafe: true });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ident = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]+$/.test(value)) throw problem('Invalid backup SQL identifier');
  return '`' + value + '`';
};

function safeMediaPath(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\\%:\x00-\x1f\x7f]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw problem('Unsafe media path in backup');
  return value;
}

function schemaHash(sql) {
  // AUTO_INCREMENT is mutable row state, not a schema difference. The value is
  // retained in create_sql for manual recovery; restore never executes this SQL.
  return sha256(sql.replace(/ AUTO_INCREMENT=\d+/g, ''));
}

async function listTables(connection) {
  const [tables] = await connection.query("SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
  if (!tables.length) throw problem('Backup requires at least one table');
  for (const table of tables) {
    ident(table.name);
    if (table.type !== 'BASE TABLE' || table.engine !== 'InnoDB') throw problem('Backup supports InnoDB base tables only; unsupported objects must be backed up separately');
  }
  // Fail closed instead of silently omitting executable database objects.
  for (const [table, schema] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
    const [rows] = await connection.query(`SELECT 1 FROM information_schema.${table} WHERE ${schema} = DATABASE() LIMIT 1`);
    if (rows.length) throw problem('Backup found unsupported triggers, routines or events');
  }
  return tables;
}

async function tableSchema(connection, name) {
  const [rows] = await connection.query('SHOW CREATE TABLE ' + ident(name));
  const sql = rows[0]?.['Create Table'];
  if (typeof sql !== 'string') throw problem('Cannot read backup table schema');
  return { create_sql: sql, schema_sha256: schemaHash(sql) };
}

async function* walkMedia(root, relative = '') {
  let entries;
  try {
    const stat = await fsp.lstat(path.join(root, relative));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw problem('Unsafe media directory or symlink');
    entries = await fsp.readdir(path.join(root, relative), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' && !relative) return;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const key = safeMediaPath(relative ? `${relative}/${entry.name}` : entry.name);
    if (entry.isSymbolicLink()) throw problem('Backup refuses media symlinks');
    if (entry.isDirectory()) yield* walkMedia(root, key);
    else if (entry.isFile()) yield key;
    else throw problem('Unsupported media filesystem entry');
  }
}

async function readMedia(root, key, onChunk) {
  safeMediaPath(key);
  const filename = path.join(root, key);
  const canonicalRoot = await fsp.realpath(root);
  if (await fsp.realpath(filename) !== path.join(canonicalRoot, key)) throw problem('Unsafe media symlink');
  const handle = await fsp.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw problem('Unsafe media file');
    const digest = hash();
    let size = 0;
    const buffer = Buffer.alloc(CHUNK_SIZE);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      digest.update(chunk);
      if (onChunk) await onChunk(chunk, size);
      size += bytesRead;
    }
    if (!size && onChunk) await onChunk(Buffer.alloc(0), 0);
    const after = await handle.stat();
    const current = await fsp.lstat(filename);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || before.ino !== current.ino || current.isSymbolicLink() || size !== before.size) throw problem('Media changed during backup; retry when media writes stop');
    return { path: key, size_bytes: size, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}

async function mediaInventory(root) {
  const files = [];
  for await (const key of walkMedia(root)) files.push(await readMedia(root, key));
  return files;
}

function collectMedia(value, refs) {
  if (typeof value === 'string') {
    if (value.startsWith('/uploads/')) refs.add(safeMediaPath(value.slice(9)));
    else if (value.startsWith('{') || value.startsWith('[')) {
      let nested;
      try { nested = JSON.parse(value); } catch { return; }
      collectMedia(nested, refs);
    }
  } else if (Array.isArray(value)) value.forEach(item => collectMedia(item, refs));
  else if (isObject(value)) Object.values(value).forEach(item => collectMedia(item, refs));
}

function encodeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    Buffer.isBuffer(value) ? { type: 'Buffer', base64: value.toString('base64') } : value]));
}

function decodeBase64(value) {
  if (typeof value !== 'string') throw problem('Invalid backup binary data');
  const data = Buffer.from(value, 'base64');
  if (data.toString('base64') !== value) throw problem('Invalid backup base64 encoding');
  return data;
}

function assertReferences(refs, disk, database, mediaStorage) {
  const available = mediaStorage === 'database' ? database : new Set(disk.map(file => file.path));
  for (const key of refs) if (!available.has(key)) throw problem('Backup contains a missing media reference');
}

async function createBackup({ db, uploadsDir = path.join(process.cwd(), 'uploads'), tempRoot = os.tmpdir(), branchId = null,
  mediaStorage = process.env.MEDIA_STORAGE === 'database' ? 'database' : 'disk', signal } = {}) {
  const directory = await fsp.mkdtemp(path.join(tempRoot, 'anyostore-backup-'));
  const cleanup = () => fsp.rm(directory, { recursive: true, force: true });
  let connection, file, transaction = false;
  const checkAbort = () => { if (signal?.aborted) throw problem('Backup cancelled'); };
  try {
    if (!['disk', 'database'].includes(mediaStorage)) throw problem('Invalid backup media mode');
    const filePath = path.join(directory, 'backup.json');
    file = await fsp.open(filePath, 'wx', 0o600);
    const write = async text => { checkAbort(); await file.writeFile(text + '\n'); };
    // The media inventory brackets the entire transaction. App media files use
    // immutable names; any intervening deletion/replacement is a failed backup.
    const initialMedia = await mediaInventory(uploadsDir);
    checkAbort();
    connection = await db.getConnection();
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query("SET time_zone = '+00:00'");
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    transaction = true;
    const tables = await listTables(connection);
    const header = JSON.stringify({ format: FORMAT, version: 2, generated_at: new Date().toISOString(), branch_id: branchId });
    await write(header.slice(0, -1) + ',"tables":{');
    const manifest = { complete: true, errors: [], total_rows: 0, tables: [], media_storage: mediaStorage, media: [],
      redactions: [{ table: 'store_settings', key: 'daily_email_api_key', replacement: '', restore: 'configure_again' }],
      excluded: ['environment_secrets', 'external_media_urls'], header_sha256: sha256(header), time_zone: '+00:00' };
    const refs = new Set(), databaseMedia = new Set();
    for (const table of tables) {
      checkAbort();
      const schema = await tableSchema(connection, table.name);
      const [fields] = await connection.query('SHOW FULL COLUMNS FROM ' + ident(table.name));
      const columns = fields.map(field => ({ name: field.Field, generated: /\b(VIRTUAL|STORED) GENERATED\b/i.test(field.Extra || '') }));
      columns.forEach(column => ident(column.name));
      const [counts] = await connection.query('SELECT COUNT(*) AS count FROM ' + ident(table.name));
      const expectedRows = Number(counts[0]?.count);
      if (!Number.isSafeInteger(expectedRows) || expectedRows < 0) throw problem('Invalid backup row count');
      await write((manifest.tables.length ? ',' : '') + JSON.stringify(table.name) + ':[');
      let count = 0;
      const digest = hash();
      const stream = connection.connection.query({ sql: 'SELECT * FROM ' + ident(table.name), dateStrings: true,
        supportBigNumbers: true, bigNumberStrings: true, jsonStrings: true }).stream({ highWaterMark: 1 });
      try {
        for await (const raw of stream) {
          checkAbort();
          const row = encodeRow(raw);
          if (table.name === 'store_settings' && sensitiveSettingKeys.has(row.key)) row.value = '';
          collectMedia(row, refs);
          if (table.name === 'media_files') databaseMedia.add(safeMediaPath(row.key));
          const line = JSON.stringify(row);
          if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw problem('Backup row exceeds supported size');
          digest.update(line + '\n');
          await write((count ? ',' : '') + line);
          count++;
        }
      } finally { stream.destroy(); }
      if (count !== expectedRows) throw problem('Backup row count mismatch');
      await write(']');
      manifest.tables.push({ name: table.name, rows: count, sha256: digest.digest('hex'), columns, ...schema });
      manifest.total_rows += count;
    }
    await write('},"media":[');
    let chunks = 0;
    for (const expected of initialMedia) {
      const actual = await readMedia(uploadsDir, expected.path, async (data, offset) => {
        await write((chunks++ ? ',' : '') + JSON.stringify({ path: expected.path, offset, data_base64: data.toString('base64') }));
      });
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw problem('Media changed during backup; retry when media writes stop');
      manifest.media.push(actual);
    }
    if (JSON.stringify(initialMedia) !== JSON.stringify(await mediaInventory(uploadsDir))) throw problem('Media changed during backup; retry when media writes stop');
    assertReferences(refs, manifest.media, databaseMedia, mediaStorage);
    const finalTables = await listTables(connection);
    if (JSON.stringify(tables) !== JSON.stringify(finalTables)) throw problem('Database schema changed during backup');
    for (const table of manifest.tables) {
      if ((await tableSchema(connection, table.name)).schema_sha256 !== table.schema_sha256) throw problem('Database schema changed during backup');
    }
    checkAbort();
    await connection.query('COMMIT');
    transaction = false;
    await write('],"manifest":');
    const manifestJson = JSON.stringify(manifest);
    await write(manifestJson);
    await write(',"manifest_sha256":' + JSON.stringify(sha256(manifestJson)) + '}');
    await file.sync();
    await file.close(); file = null;
    const sizeBytes = (await fsp.stat(filePath)).size;
    return { filePath, cleanup, manifest, generatedAt: JSON.parse(header).generated_at, sizeBytes };
  } catch (error) {
    if (transaction) await connection.query('ROLLBACK').catch(() => {});
    if (file) await file.close().catch(() => {});
    await cleanup();
    throw error.backupSafe ? error : problem('Backup snapshot gagal: pembacaan tabel atau media tidak lengkap. Coba kembali saat tidak ada perubahan media.');
  } finally {
    // This dedicated pooled connection changed session isolation/time zone.
    // Destroy it so those settings never leak to application queries.
    if (connection) connection.destroy();
  }
}

async function* readLines(filePath) {
  const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
  const decoder = new StringDecoder('utf8');
  let pending = '';
  try {
    for await (const chunk of stream) {
      pending += decoder.write(chunk);
      let position;
      while ((position = pending.indexOf('\n')) !== -1) {
        if (Buffer.byteLength(pending.slice(0, position)) > MAX_LINE_BYTES) throw problem('Backup record too large');
        yield pending.slice(0, position);
        pending = pending.slice(position + 1);
      }
      if (Buffer.byteLength(pending) > MAX_LINE_BYTES) throw problem('Backup record too large');
    }
    pending += decoder.end();
    if (pending) throw problem('Truncated backup record');
  } finally { stream.destroy(); }
}

function parseCanonical(line) {
  let value;
  try { value = JSON.parse(line); } catch { throw problem('Invalid backup JSON record'); }
  if (JSON.stringify(value) !== line) throw problem('Non-canonical or ambiguous backup record');
  return value;
}

// Strict line grammar avoids loading a complete JSON document or executing any
// SQL from the artifact. callbacks are used only on a private validated copy.
async function validateBackup(filePath, callbacks = {}) {
  let state = 'header', header, manifest, manifestJson, table, rowCount = 0, totalRows = 0, digest, mediaSeen = false;
  const tables = [], media = new Map(), refs = new Set(), databaseMedia = new Set();
  const names = new Set();
  const fullHash = hash();
  for await (const line of readLines(filePath)) {
    fullHash.update(line + '\n');
    if (state === 'header') {
      if (!line.endsWith(',"tables":{')) throw problem('Unsupported backup format; expected JSON v2');
      const headerJson = line.slice(0, -11) + '}';
      header = parseCanonical(headerJson);
      if (header.format !== FORMAT || header.version !== 2) throw problem('Unsupported backup version');
      state = 'table';
    } else if (state === 'table') {
      if (line === '},"media":[') { state = 'media'; continue; }
      const prefix = tables.length ? ',' : '';
      if (!line.startsWith(prefix + '"') || !line.endsWith(':[')) throw problem('Invalid backup table');
      table = parseCanonical(line.slice(prefix.length, -2));
      ident(table);
      if (names.has(table)) throw problem('Duplicate backup table');
      names.add(table); rowCount = 0; digest = hash();
      if (callbacks.table) await callbacks.table(table);
      state = 'row';
    } else if (state === 'row') {
      if (line === ']') {
        tables.push({ name: table, rows: rowCount, sha256: digest.digest('hex') });
        totalRows += rowCount; state = 'table'; continue;
      }
      if (rowCount && !line.startsWith(',')) throw problem('Missing backup row separator');
      const rowJson = rowCount ? line.slice(1) : line;
      const row = parseCanonical(rowJson);
      if (!isObject(row)) throw problem('Invalid backup row');
      Object.keys(row).forEach(ident);
      digest.update(rowJson + '\n'); rowCount++;
      collectMedia(row, refs);
      if (table === 'media_files') databaseMedia.add(safeMediaPath(row.key));
      if (callbacks.row) await callbacks.row(table, row);
    } else if (state === 'media') {
      if (line === '],"manifest":') { state = 'manifest'; continue; }
      if (mediaSeen && !line.startsWith(',')) throw problem('Missing media separator');
      const chunk = parseCanonical(mediaSeen ? line.slice(1) : line);
      if (!isObject(chunk)) throw problem('Invalid media record');
      const key = safeMediaPath(chunk.path);
      const bytes = decodeBase64(chunk.data_base64);
      if (bytes.length > CHUNK_SIZE) throw problem('Media chunk too large');
      const item = media.get(key) || { path: key, size_bytes: 0, digest: hash() };
      if (!Number.isSafeInteger(chunk.offset) || chunk.offset !== item.size_bytes
        || (media.has(key) && !bytes.length)) throw problem('Invalid or duplicate media offset');
      item.digest.update(bytes); item.size_bytes += bytes.length;
      media.set(key, item); mediaSeen = true;
      if (callbacks.media) await callbacks.media(key, bytes, chunk.offset);
    } else if (state === 'manifest') {
      manifest = parseCanonical(line); manifestJson = line; state = 'footer';
    } else if (state === 'footer') {
      if (line !== ',"manifest_sha256":' + JSON.stringify(sha256(manifestJson)) + '}') throw problem('Backup manifest integrity check failed');
      state = 'done';
    } else throw problem('Unexpected data after backup footer');
  }
  if (state !== 'done' || !manifest || manifest.complete !== true || !Array.isArray(manifest.errors) || manifest.errors.length
    || manifest.header_sha256 !== sha256(JSON.stringify(header)) || manifest.time_zone !== '+00:00'
    || !['disk', 'database'].includes(manifest.media_storage) || manifest.total_rows !== totalRows
    || !Array.isArray(manifest.tables) || manifest.tables.length !== tables.length || !tables.length) throw problem('Incomplete or invalid backup manifest');
  for (let i = 0; i < tables.length; i++) {
    const actual = tables[i], expected = manifest.tables[i];
    if (!expected || actual.name !== expected.name || actual.rows !== expected.rows || actual.sha256 !== expected.sha256
      || typeof expected.create_sql !== 'string' || schemaHash(expected.create_sql) !== expected.schema_sha256
      || !Array.isArray(expected.columns) || !expected.columns.length) throw problem('Backup table integrity check failed');
    const columns = new Set();
    for (const column of expected.columns) {
      ident(column.name);
      if (columns.has(column.name) || typeof column.generated !== 'boolean') throw problem('Invalid backup columns');
      columns.add(column.name);
    }
  }
  const actualMedia = [...media.values()].map(item => ({ path: item.path, size_bytes: item.size_bytes, sha256: item.digest.digest('hex') }));
  if (JSON.stringify(actualMedia) !== JSON.stringify(manifest.media)) throw problem('Backup media integrity check failed');
  assertReferences(refs, actualMedia, databaseMedia, manifest.media_storage);
  return { header, manifest, sha256: fullHash.digest('hex') };
}

function streamLegacyResponse(backup) {
  return Readable.from((async function* () {
    const data = { generated_at: backup.generatedAt, tables: backup.manifest.tables.length, total_rows: backup.manifest.total_rows,
      size_bytes: backup.sizeBytes, truncated_tables: [], complete: true, format_version: 2, media_files: backup.manifest.media.length };
    yield '{"success":true,"data":' + JSON.stringify(data).slice(0, -1) + ',"download":"';
    // StringDecoder preserves multi-byte UTF-8 split across chunks.
    for await (const chunk of fs.createReadStream(backup.filePath, { encoding: 'utf8', highWaterMark: CHUNK_SIZE })) {
      yield JSON.stringify(chunk).slice(1, -1);
    }
    yield '"}}';
  })());
}

module.exports = { createBackup, validateBackup, streamLegacyResponse, safeMediaPath, decodeBase64, ident, listTables,
  tableSchema, schemaHash, problem };
