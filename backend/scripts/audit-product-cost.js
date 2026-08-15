#!/usr/bin/env node
// Audit produk yang HARGA MODAL (cost) >= HARGA JUAL (price).
// Jalankan di container backend:
//   node scripts/audit-product-cost.js
const db = require('../src/db');

async function main() {
  const [rows] = await db.execute(
    `SELECT p.id, p.branch_id, b.name AS branch, p.sku, p.name, p.price, p.cost, p.stock
     FROM products p JOIN branches b ON b.id = p.branch_id
     WHERE p.is_active = TRUE ORDER BY p.branch_id, p.name`
  );
  const bad = rows.filter((p) => Number(p.cost || 0) >= Number(p.price || 0));
  const totalLoss = bad.reduce((s, p) => s + (Number(p.cost || 0) - Number(p.price || 0)), 0);
  console.log(`Produk dicek: ${rows.length}`);
  console.log(`Produk cost >= harga jual: ${bad.length}`);
  console.log(`Total selisih (cost - jual): ${totalLoss.toLocaleString('id-ID')}`);
  console.log('----------------------------------------');
  for (const p of bad) {
    console.log(`#${p.id} [${p.branch}] ${p.sku || '-'} ${p.name} — jual ${p.price}, modal ${p.cost}, stok ${p.stock}`);
  }
  await db.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
