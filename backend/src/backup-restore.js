const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { validateBackup, decodeBase64, safeMediaPath, ident, listTables, tableSchema, problem } = require('./backup');

function assertIsolatedTarget(options = {}) {
  if (options.nodeEnv === 'production' || process.env.NODE_ENV === 'production'
    || !['127.0.0.1', 'localhost', '::1'].includes(options.host)
    || !/^anyostore_restore_[a-z0-9_]{1,40}$/.test(options.database || '')
    || options.confirmDatabase !== options.database || options.isolated !== true) {
    throw problem('Restore requires an explicitly confirmed local isolated database named anyostore_restore_*, outside production');
  }
}

async function validateTarget(connection, manifest, target) {
  const [[current]] = await connection.query('SELECT DATABASE() AS name');
  if (current?.name !== target.database) throw problem('Restore database does not match confirmed target');
  const tables = await listTables(connection);
  if (JSON.stringify(tables.map(table => table.name)) !== JSON.stringify(manifest.tables.map(table => table.name))) {
    throw problem('Isolated target must contain the same empty table schema as the backup');
  }
  for (const table of manifest.tables) {
    if ((await tableSchema(connection, table.name)).schema_sha256 !== table.schema_sha256) throw problem('Isolated target schema does not match backup');
    const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM ' + ident(table.name));
    if (Number(row.count) !== 0) throw problem('Isolated restore target tables must be empty (kosong)');
  }
}

async function verifyForeignKeys(connection) {
  const [keys] = await connection.query(`SELECT TABLE_NAME AS child_table, COLUMN_NAME AS child_column,
    REFERENCED_TABLE_NAME AS parent_table, REFERENCED_COLUMN_NAME AS parent_column,
    CONSTRAINT_NAME AS constraint_name, REFERENCED_TABLE_SCHEMA AS parent_schema
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`);
  const [[database]] = await connection.query('SELECT DATABASE() AS name');
  const groups = new Map();
  for (const key of keys) {
    if (key.parent_schema !== database.name) throw problem('Cross-database foreign keys are not supported for isolated restore');
    const group = `${key.child_table}/${key.constraint_name}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(key);
  }
  for (const columns of groups.values()) {
    const [key] = columns;
    const join = columns.map(col => `p.${ident(col.parent_column)} = c.${ident(col.child_column)}`).join(' AND ');
    const nonnull = columns.map(col => `c.${ident(col.child_column)} IS NOT NULL`).join(' AND ');
    const [orphans] = await connection.query(`SELECT 1 FROM ${ident(key.child_table)} c WHERE ${nonnull}
      AND NOT EXISTS (SELECT 1 FROM ${ident(key.parent_table)} p WHERE ${join}) LIMIT 1`);
    if (orphans.length) throw problem('Restored data failed foreign-key integrity validation');
  }
}

function restoreValue(value) {
  if (value !== null && typeof value === 'object') {
    if (value.type === 'Buffer' && typeof value.base64 === 'string' && Object.keys(value).length === 2) return decodeBase64(value.base64);
    return JSON.stringify(value);
  }
  return value;
}

async function restoreBackup({ filePath, apply = false, target, connection, connect, mediaDir } = {}) {
  // Freeze the artifact in a private directory before validating it. Neither a
  // caller replacing the original nor edits during import can change this copy.
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'anyostore-restore-'));
  let mediaCreated = false, transaction = false, commitAttempted = false, ownedConnection = false;
  try {
    const stat = await fsp.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw problem('Restore requires a regular backup file, not a symlink');
    const privateFile = path.join(directory, 'backup.json');
    await fsp.copyFile(filePath, privateFile, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(privateFile, 0o600);
    const checked = await validateBackup(privateFile);
    const report = { applied: false, tables: checked.manifest.tables.length, total_rows: checked.manifest.total_rows,
      media_files: checked.manifest.media.length, media_storage: checked.manifest.media_storage, sha256: checked.sha256,
      redactions: checked.manifest.redactions, target_checked: false };
    if (!apply) return report; // No connection or target filesystem writes on dry-run.
    assertIsolatedTarget(target);
    if (!mediaDir || !path.isAbsolute(mediaDir) || path.basename(mediaDir) === 'uploads') {
      throw problem('Choose a new absolute isolated media directory (not an application uploads directory)');
    }
    // mkdir without recursive guarantees this operation never reuses any target.
    try { await fsp.mkdir(mediaDir, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') throw problem('Restore media directory must be new; target already exists'); throw error; }
    mediaCreated = true;
    if (!connection) {
      if (!connect) throw problem('Missing isolated restore connection');
      connection = await connect(target); ownedConnection = true;
    }
    await connection.query("SET time_zone = '+00:00'");
    await connection.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION'");
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.query('START TRANSACTION'); transaction = true;
    await validateTarget(connection, checked.manifest, target);
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    const schemas = new Map(checked.manifest.tables.map(table => [table.name, table]));
    const restored = await validateBackup(privateFile, {
      async row(name, row) {
        const schema = schemas.get(name);
        const names = schema.columns.map(column => column.name);
        if (Object.keys(row).length !== names.length || !names.every(column => Object.hasOwn(row, column))) throw problem('Backup row columns do not match schema');
        const columns = schema.columns.filter(column => !column.generated).map(column => column.name);
        const values = columns.map(column => restoreValue(row[column]));
        // Never execute artifact DDL, interpolate values or run multiple statements.
        const [result] = await connection.query(`INSERT INTO ${ident(name)} (${columns.map(ident).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
        if (result.affectedRows !== 1 || result.warningStatus) throw problem('Restore insert was incomplete or produced warnings');
      },
      async media(key, bytes, offset) {
        safeMediaPath(key);
        const destination = path.join(mediaDir, key);
        await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        const handle = await fsp.open(destination, offset === 0 ? 'wx' : fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
        try {
          if ((await handle.stat()).size !== offset) throw problem('Restore media offset mismatch');
          let written = 0;
          while (written < bytes.length) {
            const result = await handle.write(bytes, written, bytes.length - written, offset + written);
            if (!result.bytesWritten) throw problem('Restore media write failed');
            written += result.bytesWritten;
          }
          await handle.sync();
        } finally { await handle.close(); }
      },
    });
    if (restored.sha256 !== checked.sha256) throw problem('Backup changed after validation');
    for (const table of checked.manifest.tables) {
      const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM ' + ident(table.name));
      if (Number(row.count) !== table.rows) throw problem('Restored row count does not match manifest');
    }
    await verifyForeignKeys(connection);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    commitAttempted = true;
    await connection.query('COMMIT'); transaction = false;
    return { ...report, applied: true, target_checked: true };
  } catch (error) {
    if (transaction) await connection.query('ROLLBACK').catch(() => {});
    // Once COMMIT was sent, its result can be ambiguous on network loss. Keep
    // media for diagnosis instead of deleting a potentially committed restore.
    if (mediaCreated && !commitAttempted) await fsp.rm(mediaDir, { recursive: true, force: true });
    if (commitAttempted) throw problem('Restore COMMIT outcome is uncertain. Keep the isolated database and media for inspection; do not use as production');
    throw error.backupSafe ? error : problem('Restore validation or isolated import failed; no production connection was used');
  } finally {
    if (connection && ownedConnection) await connection.end().catch(() => {});
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { restoreBackup, assertIsolatedTarget };
