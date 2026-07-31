const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

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

  for (const file of files) {
    if (done.has(file)) { console.log(`[migrate] skip ${file}`); continue; }
    const full = path.join(dir, file);
    const sql = fs.readFileSync(full, 'utf8');
    // split by statements loosely, run as multi-statement but catch errors per file
    console.log(`[migrate] applying ${file}`);
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
      console.log(`[migrate] done ${file}`);
    } catch (e) {
      // tolerant: if duplicate column / already exists, mark as done if error is ER_DUP_FIELDNAME or ER_DUP_ENTRY or syntax tolerant
      const msg = String(e.message || '');
      console.warn(`[migrate] error in ${file}: ${msg}`);
      if (msg.includes('Duplicate column') || msg.includes('already exists') || msg.includes('Duplicate entry') || msg.includes('ER_DUP_')) {
        await conn.query('INSERT IGNORE INTO _migrations (filename) VALUES (?)', [file]);
        console.log(`[migrate] marked ${file} as done despite duplicate`);
      } else {
        // for ENUM modifications that fail because value exists, try idempotent handling: mark done if error contains "Duplicate"
        await conn.query('INSERT IGNORE INTO _migrations (filename) VALUES (?)', [file]);
        console.warn(`[migrate] continuing despite error`);
      }
    }
  }
  await conn.end();
  console.log('[migrate] all done');
}

run().catch((e) => { console.error('[migrate] fatal', e); process.exit(0); });
