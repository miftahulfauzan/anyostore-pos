#!/usr/bin/env node
// Does not import application config/db or load .env: isolated credentials only.
const { restoreBackup, assertIsolatedTarget } = require('../src/backup-restore');

function parseArgs(argv, env = process.env) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--isolated') options.isolated = true;
    else if (['--file', '--media-dir', '--confirm-database'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Missing argument value');
      options[arg.slice(2)] = argv[++i];
    } else throw new Error('Unknown restore argument');
  }
  if (!options.file) throw new Error('Usage: node scripts/restore-backup.js --file /absolute/backup.json [--apply --isolated --confirm-database anyostore_restore_NAME --media-dir /absolute/new-media]');
  const target = { host: env.RESTORE_DB_HOST, database: env.RESTORE_DB_NAME, confirmDatabase: options['confirm-database'],
    isolated: options.isolated === true, nodeEnv: env.NODE_ENV };
  if (options.apply) {
    assertIsolatedTarget(target);
    if (!env.RESTORE_DB_USER || !env.RESTORE_DB_PASSWORD) throw new Error('RESTORE_DB_USER and RESTORE_DB_PASSWORD are required');
    const port = Number(env.RESTORE_DB_PORT || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid RESTORE_DB_PORT');
  }
  return { filePath: options.file, mediaDir: options['media-dir'], apply: options.apply, target };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);
  const result = await restoreBackup({ ...options, connect: async target => require('mysql2/promise').createConnection({
    host: target.host, database: target.database, port: Number(env.RESTORE_DB_PORT || 3306),
    user: env.RESTORE_DB_USER, password: env.RESTORE_DB_PASSWORD, multipleStatements: false,
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true,
  }) });
  // Summary contains no rows, credentials, arbitrary error strings or DDL.
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) main().catch(error => {
  process.stderr.write((error.backupSafe ? error.message : 'Restore failed: check arguments, backup validity and isolated target configuration') + '\n');
  process.exitCode = 1;
});

module.exports = { parseArgs, main };
