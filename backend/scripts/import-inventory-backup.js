#!/usr/bin/env node
// Import histori stockMasuk/stockKeluar dari inventory-backup JSON.
// Preview: node scripts/import-inventory-backup.js /tmp/inventory-backup.json
// Apply:   node scripts/import-inventory-backup.js /tmp/inventory-backup.json --apply
// Histori saja: tidak mengubah products.stock, product_variants.stock, atau warehouse_stocks.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function normalizeSku(value) {
  return String(value || '').trim().toLowerCase();
}

function readRows(backup, key, type) {
  if (!Array.isArray(backup?.reports?.[key])) throw new Error(`reports.${key} tidak ditemukan di backup JSON`);
  return backup.reports[key].map((row) => ({
    source_id: Number(row.id),
    type,
    sku: String(row.sku || '').trim(),
    quantity: Number(row.qty),
    number: String(row.nomor || '').trim(),
    warehouse: String(row.gudang || '').trim(),
    description: String(type === 'incoming' ? row.keterangan || '' : row.tujuan || '').trim(),
    admin: String(row.admin || '').trim(),
    date: String(row.created_at || row.tanggal || '').trim(),
  })).filter((row) => row.warehouse.toLowerCase() === 'gudang utama');
}

async function main() {
  const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const apply = process.argv.includes('--apply');
  if (!csvPath) throw new Error('Berikan path backup JSON.');
  const backup = JSON.parse(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  const rows = [...readRows(backup, 'stockMasuk', 'incoming'), ...readRows(backup, 'stockKeluar', 'outgoing')];
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'pos_pakaian', user: process.env.DB_USER || 'pos_user',
    password: process.env.DB_PASSWORD || '',
  });
  try {
    await connection.beginTransaction();
    const [branches] = await connection.execute('SELECT id, name FROM branches WHERE LOWER(name)=LOWER(?) AND is_active=TRUE LIMIT 1', ['Gudang Utama']);
    if (!branches[0]) throw new Error('Cabang Gudang Utama tidak ditemukan.');
    const branchId = branches[0].id;
    const [warehouses] = await connection.execute("SELECT id, name FROM warehouses WHERE branch_id=? AND type='utama' AND is_active=TRUE ORDER BY id LIMIT 1", [branchId]);
    if (!warehouses[0]) throw new Error('Gudang utama di cabang Gudang Utama tidak ditemukan.');
    const warehouseId = warehouses[0].id;
    const [users] = await connection.execute("SELECT id FROM users WHERE branch_id=? AND is_active=TRUE ORDER BY role='owner' DESC, id LIMIT 1", [branchId]);
    if (!users[0]) throw new Error('Tidak ada user aktif untuk mencatat histori.');
    const userId = users[0].id;
    const [products] = await connection.execute('SELECT id, sku, name FROM products WHERE branch_id=? AND is_active=TRUE', [branchId]);
    const productBySku = new Map(products.filter((p) => p.sku).map((p) => [normalizeSku(p.sku), p]));
    const skipped = []; let inserted = 0; let alreadyImported = 0; let totalQty = 0;
    for (const row of rows) {
      const product = productBySku.get(normalizeSku(row.sku)) || productBySku.get(normalizeSku(`B${branchId}-${row.sku}`));
      if (!product) { skipped.push({ sku: row.sku, number: row.number, type: row.type }); continue; }
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) { skipped.push({ sku: row.sku, number: row.number, type: row.type, reason: 'qty tidak valid' }); continue; }
      const referenceType = row.type === 'incoming' ? 'legacy_stock_in' : 'legacy_stock_out';
      const [existing] = await connection.execute('SELECT id FROM stock_mutations WHERE reference_type=? AND reference_id=? AND product_id=? LIMIT 1', [referenceType, row.source_id, product.id]);
      if (existing[0]) { alreadyImported++; continue; }
      if (apply) {
        await connection.execute(
          `INSERT INTO stock_mutations
           (branch_id, warehouse_id, product_id, variant_id, user_id, type, reference_type, reference_id, batch_number, qty, stock_before, stock_after, notes, created_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
          [branchId, warehouseId, product.id, userId, row.type === 'incoming' ? 'purchase' : 'adjustment', referenceType, row.source_id,
            row.number || null, row.type === 'incoming' ? row.quantity : -row.quantity,
            `${row.description || '-'} | Import histori dari project lama${row.admin ? ` | Admin: ${row.admin}` : ''}`, row.date || null]
        );
      }
      inserted++; totalQty += row.quantity;
    }
    if (apply) await connection.commit(); else await connection.rollback();
    console.log(`${apply ? '✅ Histori berhasil diimpor' : '🔎 Preview (tidak mengubah database)'}`);
    console.log(`Baris sumber Gudang Utama: ${rows.length}`);
    console.log(`Akan/berhasil masuk: ${inserted} baris · sudah ada: ${alreadyImported} · dilewati: ${skipped.length} · total qty: ${totalQty}`);
    console.log(`Tujuan: cabang ${branches[0].name} · gudang ${warehouses[0].name}`);
    if (skipped.length) console.log('SKU/baris dilewati:', JSON.stringify(skipped.slice(0, 30)));
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }
}

if (require.main === module) main().catch((error) => { console.error(`❌ ${error.message}`); process.exit(1); });
module.exports = { normalizeSku, readRows };
