#!/usr/bin/env node
/**
 * Isi berat semua produk (semua cabang & gudang) dengan nilai yang sama.
 *
 * Pemakaian (di dalam container backend):
 *   node scripts/set-product-weight.js 400
 *   node scripts/set-product-weight.js 400 --dry-run
 *   node scripts/set-product-weight.js 400 --branch 2
 */
const db = require('../src/db');

const args = process.argv.slice(2);
const weight = Number(args.find((arg) => /^\d+$/.test(arg)) || 400);
const dryRun = args.includes('--dry-run');
const branchIndex = args.indexOf('--branch');
const branchId = branchIndex >= 0 ? Number(args[branchIndex + 1]) : null;

async function main() {
  if (!Number.isFinite(weight) || weight <= 0) {
    console.error('Berat harus angka gram > 0.');
    process.exit(1);
  }

  const params = [];
  let where = 'WHERE 1=1';
  if (Number.isInteger(branchId) && branchId > 0) {
    where += ' AND branch_id = ?';
    params.push(branchId);
  }

  const [before] = await db.execute(
    `SELECT COUNT(*) AS total, SUM(weight_gram <> ?) AS perlu_ubah FROM products ${where}`,
    [weight, ...params]
  );
  const branchFilter = Number.isInteger(branchId) && branchId > 0 ? 'AND b.id = ?' : '';
  const [perBranch] = await db.execute(
    `SELECT b.id, b.name, COUNT(p.id) AS produk
       FROM branches b LEFT JOIN products p ON p.branch_id = b.id
      WHERE 1=1 ${branchFilter}
      GROUP BY b.id, b.name ORDER BY b.id`,
    params
  );

  console.log(`Target berat: ${weight} gram${branchId ? ` (cabang ${branchId})` : ' (semua cabang)'}`);
  console.log(`Produk: ${Number(before[0].total)} · perlu diubah: ${Number(before[0].perlu_ubah || 0)}`);
  perBranch.forEach((row) => console.log(`  - ${row.name}: ${row.produk} produk`));

  if (dryRun) {
    console.log('Mode dry-run: tidak ada perubahan.');
    process.exit(0);
  }

  const [result] = await db.execute(`UPDATE products SET weight_gram = ? ${where}`, [weight, ...params]);
  console.log(`Selesai. ${result.affectedRows} produk diisi ${weight} gram.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Gagal:', error.message);
  process.exit(1);
});
