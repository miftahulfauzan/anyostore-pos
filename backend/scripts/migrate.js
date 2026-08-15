const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) UNIQUE, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, content_hash VARCHAR(64) NULL)`);
  try {
    // Tabel lama tanpa kolom hash (sebelum guard ini).
    await conn.query('ALTER TABLE _migrations ADD COLUMN content_hash VARCHAR(64) NULL');
  } catch (_) { /* duplicate column: abaikan */ }
  const [executed] = await conn.query('SELECT filename, content_hash FROM _migrations');
  const done = new Map(executed.map(r => [r.filename, r.content_hash]));

  const stats = { applied: 0, skipped: 0, idempotent: 0, failed: [] };

  for (const file of files) {
    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');
    if (done.has(file)) {
      const prevHash = done.get(file);
      if (prevHash && prevHash !== hash) {
        // File migrasi DIEDIT setelah pernah dijalankan -> berbahaya (kolom
        // tidak pernah terpasang). Wajib buat file migrasi BARU, bukan edit.
        const msg = `file sudah terpasang tapi isinya BERUBAH — buat file migrasi baru, jangan edit file lama (hash lama ${prevHash.slice(0, 12)} != ${hash.slice(0, 12)})`;
        console.error(`[migrate] FAILED ${file}: ${msg}`);
        stats.failed.push({ file, message: msg });
        continue;
      }
      if (!prevHash) {
        // Migrasi lama (sebelum guard hash) — tidak bisa diverifikasi.
        console.log(`[migrate] skip ${file} (tanpa hash terverifikasi)`);
      } else {
        console.log(`[migrate] skip ${file}`);
      }
      stats.skipped += 1;
      continue;
    }
    // split by statements loosely, run as multi-statement but catch errors per file
    console.log(`[migrate] applying ${file}`);
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO _migrations (filename, content_hash) VALUES (?, ?)', [file, hash]);
      console.log(`[migrate] done ${file}`);
      stats.applied += 1;
    } catch (e) {
      const msg = firstLine(e);
      if (isIdempotentError(msg)) {
        // Tujuan migrasi sudah terpenuhi (kolom/entry/tabel sudah ada) — aman
        // ditandai selesai supaya tidak gagal lagi di restart berikutnya.
        await conn.query('INSERT IGNORE INTO _migrations (filename, content_hash) VALUES (?, ?)', [file, hash]);
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
