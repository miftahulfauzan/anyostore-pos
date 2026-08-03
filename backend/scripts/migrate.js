const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Kesalahan yang boleh dianggap "migrasi sudah terpasang" (idempotent). Ini
// terjadi saat file dijalankan ulang terhadap DB yang sudah punya kolom/key/
// tabel — contoh: volume DB baru, schema+migrasi sudah dipasang oleh
// docker-entrypoint-initdb.d, lalu migrate.js menjalankan file yang sama lagi.
// Selain pola ini, error apa pun = kegagalan NYATA: file TIDAK ditandai
// selesai dan script keluar dengan kode non-zero.
const IDEMPOTENT_ERROR_PATTERNS = [
  /duplicate column/i,
  /duplicate entry/i,
  /already exists/i,
  /ER_DUP_/i,
];

function firstLine(text) {
  return String(text || '').split('\n')[0].trim();
}

function isIdempotentError(message) {
  return IDEMPOTENT_ERROR_PATTERNS.some((pattern) => pattern.test(message || ''));
}

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(dir)) { console.log('No migrations dir'); return; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const [executed] = await conn.query('SELECT filename FROM _migrations');
  const done = new Set(executed.map(r => r.filename));

  const stats = { applied: 0, skipped: 0, idempotent: 0, failed: [] };

  for (const file of files) {
    if (done.has(file)) { console.log(`[migrate] skip ${file}`); stats.skipped += 1; continue; }
    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    // split by statements loosely, run as multi-statement but catch errors per file
    console.log(`[migrate] applying ${file}`);
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
      console.log(`[migrate] done ${file}`);
      stats.applied += 1;
    } catch (e) {
      const msg = firstLine(e);
      if (isIdempotentError(msg)) {
        // Tujuan migrasi sudah terpenuhi (kolom/entry/tabel sudah ada) — aman
        // ditandai selesai supaya tidak gagal lagi di restart berikutnya.
        await conn.query('INSERT IGNORE INTO _migrations (filename) VALUES (?)', [file]);
        console.log(`[migrate] marked ${file} as done (idempotent): ${msg}`);
        stats.idempotent += 1;
      } else {
        // Kegagalan nyata: jangan tandai selesai. File akan dicoba ulang pada
        // restart/deploy berikutnya. Lanjutkan memeriksa file lain supaya satu
        // laporan memuat semua kegagalan, lalu keluar non-zero di akhir.
        console.error(`[migrate] FAILED ${file}: ${msg}`);
        stats.failed.push({ file, message: msg });
      }
    }
  }

  console.log(`[migrate] summary: ${stats.applied} applied, ${stats.skipped} skipped, ${stats.idempotent} idempotent, ${stats.failed.length} failed`);
  if (stats.failed.length) {
    console.error('[migrate] FAILED — file berikut TIDAK ditandai selesai dan akan dicoba ulang pada restart/deploy berikutnya:');
    for (const failure of stats.failed) console.error(`  - ${failure.file}: ${failure.message}`);
  }
  await conn.end();
  if (stats.failed.length) process.exit(1);
}

run().catch((e) => { console.error('[migrate] fatal:', firstLine(e)); process.exit(1); });
