#!/usr/bin/env node
/**
 * Bandingkan setelan dua cabang di store_settings, dan (opsional) salin
 * setelan dari cabang sumber ke cabang tujuan.
 *
 * Pemakaian (jalankan di container backend VPS):
 *   node scripts/compare-branch-settings.js "BASIK PGMTA" "Anyo Blok B"
 *   node scripts/compare-branch-settings.js 1 2 --apply
 *   node scripts/compare-branch-settings.js 1 2 --apply --keys=receipt_font,receipt_margin
 *
 * Tanpa --apply hanya menampilkan perbedaan (dry run).
 *
 * Catatan keamanan:
 * - Identitas toko (nama/alamat/telepon/email/NPWP) TIDAK pernah disalin
 *   kecuali diberi --include-identity, karena tiap cabang punya identitasnya.
 * - Rahasia (API key email & RajaOngkir) tidak pernah disalin.
 */
const db = require('../src/db');

const IDENTITY_KEYS = new Set([
  'store_name',
  'store_address',
  'store_phone',
  'store_email',
  'store_tax_id',
]);
const SECRET_KEYS = new Set([
  'daily_email_api_key',
  'daily_email_last_sent_date',
  'rajaongkir_api_key',
]);

function parseArgs(argv) {
  const positional = [];
  const flags = { apply: false, includeIdentity: false, keys: null, secretsLast4: false };
  for (const arg of argv) {
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--include-identity') flags.includeIdentity = true;
    else if (arg.startsWith('--keys=')) {
      flags.keys = arg.slice('--keys='.length).split(',').map((key) => key.trim()).filter(Boolean);
    } else positional.push(arg);
  }
  return { positional, flags };
}

async function resolveBranch(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('Nama atau id cabang wajib diisi');
  if (/^\d+$/.test(value)) {
    const [rows] = await db.execute('SELECT id, name FROM branches WHERE id=? LIMIT 1', [Number(value)]);
    if (rows[0]) return rows[0];
  }
  const [exact] = await db.execute('SELECT id, name FROM branches WHERE LOWER(TRIM(name))=? LIMIT 1', [value.toLowerCase()]);
  if (exact[0]) return exact[0];
  const [like] = await db.execute('SELECT id, name FROM branches WHERE name LIKE ? ORDER BY id LIMIT 1', [`%${value}%`]);
  if (like[0]) return like[0];
  throw new Error(`Cabang "${value}" tidak ditemukan`);
}

async function loadSettings(branchId) {
  const [rows] = await db.execute('SELECT `key`, `value` FROM store_settings WHERE branch_id=?', [branchId]);
  return new Map(rows.map((row) => [row.key, row.value]));
}

function mask(key, value) {
  if (!SECRET_KEYS.has(key)) return value;
  const text = String(value ?? '');
  if (!text) return '(kosong)';
  return `***${text.slice(-4)}`;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (positional.length < 2) {
    console.error('Pemakaian: node scripts/compare-branch-settings.js <sumber> <tujuan> [--apply] [--keys=a,b] [--include-identity]');
    process.exit(1);
  }
  const [sourceToken, targetToken] = positional;
  const source = await resolveBranch(sourceToken);
  const target = await resolveBranch(targetToken);
  if (source.id === target.id) throw new Error('Cabang sumber dan tujuan sama');

  const sourceSettings = await loadSettings(source.id);
  const targetSettings = await loadSettings(target.id);
  const keys = [...new Set([...sourceSettings.keys(), ...targetSettings.keys()])].sort();

  const rows = [];
  for (const key of keys) {
    if (SECRET_KEYS.has(key)) continue;
    if (IDENTITY_KEYS.has(key) && !flags.includeIdentity) continue;
    if (flags.keys && !flags.keys.includes(key)) continue;
    const from = sourceSettings.get(key);
    const to = targetSettings.get(key);
    if (String(from ?? '') === String(to ?? '')) continue;
    rows.push({
      key,
      source: mask(key, from ?? ''),
      target: mask(key, to ?? ''),
      missing: !targetSettings.has(key),
    });
  }

  console.log(`Sumber : ${source.name} (id ${source.id})`);
  console.log(`Tujuan : ${target.name} (id ${target.id})`);
  console.log(`Mode   : ${flags.apply ? 'SALIN (apply)' : 'dry run (tidak ada perubahan)'}`);
  if (flags.keys) console.log(`Filter : ${flags.keys.join(', ')}`);
  console.log('');

  if (!rows.length) {
    console.log('Tidak ada perbedaan pada setelan yang dibandingkan.');
    return;
  }

  const width = Math.max(...rows.map((row) => row.key.length));
  console.log(`${'KEY'.padEnd(width)} | ${source.name}`);
  console.log(`${' '.repeat(width)} | ${target.name}`);
  console.log(`${'-'.repeat(width)}-+-${'-'.repeat(40)}`);
  for (const row of rows) {
    console.log(`${row.key.padEnd(width)} | sumber: ${row.source}`);
    console.log(`${' '.repeat(width)} | tujuan: ${row.target === '' ? '(kosong)' : row.target}${row.missing ? '  [belum ada]' : ''}`);
    console.log(`${' '.repeat(width)} |`);
  }

  if (!flags.apply) {
    console.log(`\n${rows.length} kunci berbeda. Jalankan ulang dengan --apply untuk menyalin dari sumber ke tujuan.`);
    return;
  }

  let changed = 0;
  for (const row of rows) {
    const value = sourceSettings.get(row.key) ?? '';
    await db.execute(
      'INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [target.id, row.key, String(value)]
    );
    changed += 1;
    console.log(`Disalin: ${row.key} -> ${target.name}`);
  }
  console.log(`\nSelesai. ${changed} kunci disalin ke ${target.name} (id ${target.id}).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`Gagal: ${error.message}`);
    process.exit(1);
  });
