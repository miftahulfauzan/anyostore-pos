#!/usr/bin/env node
// Import snapshot stok per cabang/gudang dari CSV hasil laporan inventory.
// Default hanya preview. Gunakan --apply setelah preview aman.
// Format CSV: Tujuan,SKU,Nama Produk,Qty

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { parseCsv } = require('./import-products-from-csv');
const { normalizeTransferSku } = require('../src/transfer-sku');
const { adjustStock } = require('../src/stock');
const { localDateString } = require('../src/local-date');

const TARGET_ALIASES = new Map([
  ['rak riject', ['rak riject', 'riject']],
  ['gudang riject perbaikan', ['gudang riject perbaikan', 'riject perbaikan']],
]);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSnapshotTarget(value) {
  const target = normalizeText(value);
  for (const [canonical, aliases] of TARGET_ALIASES) {
    if (aliases.includes(target)) return canonical;
  }
  return null;
}

function parseQuantity(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (text === '') throw new Error(`Qty tidak valid: ${value}`);
  const quantity = Number(text);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`Qty tidak valid: ${value}`);
  return quantity;
}

function parseSnapshotRows(rows) {
  const seen = new Set();
  return rows.map((row, index) => {
    const target = normalizeSnapshotTarget(row.Tujuan);
    const sku = String(row.SKU || '').trim();
    const name = String(row['Nama Produk'] || '').trim();
    if (!target) throw new Error(`Tujuan tidak dikenal pada baris ${index + 2}: ${row.Tujuan || '(kosong)'}`);
    if (!sku) throw new Error(`SKU kosong pada baris ${index + 2}`);
    const key = `${target}:${normalizeTransferSku(sku)}`;
    if (seen.has(key)) throw new Error(`Baris duplikat untuk ${target}: ${sku}`);
    seen.add(key);
    return { target, sku, name, quantity: parseQuantity(row.Qty) };
  });
}

function planSnapshotMatches(rows, products) {
  const matched = [];
  const missing = [];
  const ambiguous = [];
  const variantBlocked = [];
  for (const row of rows) {
    const key = normalizeTransferSku(row.sku);
    const candidates = products.filter((product) => normalizeTransferSku(product.sku) === key);
    if (!candidates.length) {
      missing.push(row);
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({ ...row, candidates: candidates.map((product) => ({ id: product.id, sku: product.sku, name: product.name })) });
      continue;
    }
    const product = candidates[0];
    if (Number(product.variant_count || 0) > 0) {
      variantBlocked.push({ ...row, product });
      continue;
    }
    matched.push({ ...row, product });
  }
  return {
    matched,
    missing,
    ambiguous,
    variantBlocked,
    safe: !missing.length && !ambiguous.length && !variantBlocked.length,
  };
}

function resolveBranch(branches, target) {
  const aliases = TARGET_ALIASES.get(target) || [];
  const matches = branches.filter((branch) => aliases.includes(normalizeText(branch.name)));
  if (matches.length !== 1) {
    const names = matches.map((branch) => branch.name).join(', ') || 'tidak ditemukan';
    throw new Error(`Cabang target ${target} harus tepat satu, hasil: ${names}`);
  }
  return matches[0];
}

function printPlan(target, branch, warehouse, plan) {
  const desired = plan.matched.reduce((sum, row) => sum + row.quantity, 0);
  console.log(`- ${target}: ${branch.name} / ${warehouse.name}`);
  console.log(`  Cocok: ${plan.matched.length} baris · stok snapshot: ${desired}`);
  if (plan.missing.length) console.log(`  SKU tidak ditemukan: ${JSON.stringify(plan.missing.map((row) => row.sku))}`);
  if (plan.ambiguous.length) console.log(`  SKU ambigu: ${JSON.stringify(plan.ambiguous.map((row) => row.sku))}`);
  if (plan.variantBlocked.length) console.log(`  Perlu rincian varian warna: ${JSON.stringify(plan.variantBlocked.map((row) => row.sku))}`);
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((arg) => !arg.startsWith('--'));
  const apply = args.includes('--apply');
  const snapshotDateArg = args.find((arg) => arg.startsWith('--date='));
  const snapshotDate = snapshotDateArg ? snapshotDateArg.slice('--date='.length) : localDateString();
  if (!csvPath) throw new Error('Berikan path CSV. Contoh: node scripts/import-warehouse-snapshot.js /tmp/inventory-warehouse-snapshot.csv');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error(`Tanggal tidak valid: ${snapshotDate}`);

  const rows = parseSnapshotRows(parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8')));
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'pos_pakaian',
    user: process.env.DB_USER || 'pos_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
      await connection.beginTransaction();
    const [branches] = await connection.execute('SELECT id, name, type FROM branches WHERE is_active=TRUE');
    const plans = [];
    for (const target of TARGET_ALIASES.keys()) {
      const targetRows = rows.filter((row) => row.target === target);
      if (!targetRows.length) throw new Error(`CSV belum memiliki data untuk ${target}`);
      const branch = resolveBranch(branches, target);
      const [warehouses] = await connection.execute(
        "SELECT id, name, type FROM warehouses WHERE branch_id=? AND is_active=TRUE ORDER BY (type='utama') DESC, id",
        [branch.id],
      );
      if (warehouses.length !== 1) throw new Error(`Cabang ${branch.name} harus memiliki tepat satu gudang aktif untuk snapshot`);
      const warehouse = warehouses[0];
      const [products] = await connection.execute(
        `SELECT p.id, p.branch_id, p.sku, p.name, COUNT(pv.id) AS variant_count
         FROM products p
         LEFT JOIN product_variants pv ON pv.product_id=p.id AND pv.is_active=TRUE
         WHERE p.branch_id=? AND p.is_active=TRUE
         GROUP BY p.id, p.branch_id, p.sku, p.name`,
        [branch.id],
      );
      const plan = planSnapshotMatches(targetRows, products);
      printPlan(target, branch, warehouse, plan);
      plans.push({ target, branch, warehouse, plan });
    }

    if (plans.some(({ plan }) => !plan.safe)) {
      await connection.rollback();
      console.log('❌ Preview dibatalkan: perbaiki SKU/varian yang dilaporkan sebelum --apply. Database tidak berubah.');
      process.exitCode = 2;
      return;
    }

    const totalQty = plans.reduce((sum, item) => sum + item.plan.matched.reduce((inner, row) => inner + row.quantity, 0), 0);
    if (!apply) {
      await connection.rollback();
      console.log(`🔎 Preview selesai: ${rows.length} baris cocok · total snapshot dua tujuan: ${totalQty} pcs. Database tidak berubah.`);
      return;
    }

    const [users] = await connection.execute("SELECT id FROM users WHERE is_active=TRUE ORDER BY role='owner' DESC, id LIMIT 1");
    if (!users[0]) throw new Error('Tidak ada user aktif untuk mencatat opname import.');
    const userId = users[0].id;
    let totalChanged = 0;
    for (const { target, branch, warehouse, plan } of plans) {
      const [opname] = await connection.execute(
        `INSERT INTO stock_opnames
         (warehouse_id, branch_id, opname_date, total_items, status, approved_by, approved_at, notes, created_by)
         VALUES (?, ?, ?, ?, 'approved', ?, NOW(), ?, ?)`,
        [warehouse.id, branch.id, snapshotDate, plan.matched.length, userId, `Import snapshot Laporan Inventory ${snapshotDate}`, userId],
      );
      let difference = 0;
      for (const row of plan.matched) {
        const [balances] = await connection.execute(
          'SELECT id, quantity FROM warehouse_stocks WHERE warehouse_id=? AND product_id=? AND variant_id IS NULL FOR UPDATE',
          [warehouse.id, row.product.id],
        );
        const systemStock = Number(balances[0]?.quantity || 0);
        const delta = row.quantity - systemStock;
        difference += delta;
        if (delta) {
          await adjustStock(connection, {
            branchId: branch.id,
            warehouseId: warehouse.id,
            productId: row.product.id,
            variantId: null,
            delta,
            userId,
            type: 'adjustment',
            referenceType: 'stock_opname',
            referenceId: opname.insertId,
            notes: `Import snapshot Laporan Inventory ${snapshotDate}`,
          });
          totalChanged += Math.abs(delta);
        }
        await connection.execute(
          `INSERT INTO stock_opname_items
           (opname_id, product_id, variant_id, system_stock, physical_stock, selisih, notes)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
          [opname.insertId, row.product.id, systemStock, row.quantity, delta, `SKU ${row.sku}`],
        );
      }
      await connection.execute('UPDATE stock_opnames SET total_selisih=? WHERE id=?', [difference, opname.insertId]);
      await connection.execute(
        'INSERT INTO activity_logs (user_id, action, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [userId, 'stock_opname', `Import snapshot ${target}: ${plan.matched.length} SKU, selisih ${difference}`, null, 'import-warehouse-snapshot'],
      );
    }
    await connection.commit();
    console.log(`✅ Snapshot berhasil diterapkan: ${rows.length} baris · target ${totalQty} pcs · perubahan stok ${totalChanged} pcs.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

if (require.main === module) main().catch((error) => { console.error(`❌ ${error.message}`); process.exit(1); });

module.exports = {
  normalizeSnapshotTarget,
  parseSnapshotRows,
  planSnapshotMatches,
};

