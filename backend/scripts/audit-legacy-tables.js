#!/usr/bin/env node
// Audit tabel legacy/deprecated: menampilkan jumlah baris & status referensi.
// READ-ONLY — tidak menghapus apa pun. Jalankan di container backend:
//   node scripts/audit-legacy-tables.js
const db = require('../src/db');

const CANDIDATES = [
  ['chart_of_accounts', 'tidak dipakai (auto-approve tanpa jurnal)'],
  ['journal_entries', 'tidak dipakai (auto-approve tanpa jurnal)'],
  ['journal_entry_items', 'tidak dipakai (auto-approve tanpa jurnal)'],
  ['shifts', 'fitur shift belum aktif'],
  ['shift_templates', 'fitur shift belum aktif'],
  ['employee_schedules', 'fitur jadwal pegawai belum aktif'],
  ['expense_schedules', 'fitur jadwal pengeluaran belum aktif'],
  ['expense_budgets', 'fitur anggaran belum aktif'],
  ['periods', 'kemungkinan legacy lama'],
  ['referrals', 'fitur referral belum aktif'],
  ['loyalty_points', 'fitur loyalty belum aktif'],
  ['pending_transactions', 'kemungkinan diganti hold/resume'],
];

async function main() {
  console.log('Tabel kandidat legacy — jumlah baris:');
  console.log('--------------------------------------');
  for (const [table, note] of CANDIDATES) {
    try {
      const [rows] = await db.execute(`SELECT COUNT(*) AS c FROM \`${table}\``);
      console.log(`- ${table.padEnd(24)} ${String(rows[0].c).padStart(6)} baris  (${note})`);
    } catch (e) {
      console.log(`- ${table.padEnd(24)}      ?  (query gagal: ${e.message})`);
    }
  }
  await db.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
