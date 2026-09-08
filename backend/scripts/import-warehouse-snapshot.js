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

function normalizeProductName(value) {
  return normalizeText(value).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalSkuRank(product) {
  let key = String(product.sku || '').trim().toUpperCase();
  let branchPrefixCount = 0;
  while (/^B\d+-/.test(key)) {
    branchPrefixCount += 1;
    key = key.replace(/^B\d+-/, '');
  }
  return {
    branchPrefixCount,
    generatedSuffix: /-\d+$/.test(key) ? 1 : 0,
    id: Number(product.id) || Number.MAX_SAFE_INTEGER,
  };
}

function compareCanonicalProducts(left, right) {
  const a = canonicalSkuRank(left);
  const b = canonicalSkuRank(right);
  return b.branchPrefixCount - a.branchPrefixCount
    || a.generatedSuffix - b.generatedSuffix
    || a.id - b.id;
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

function planSnapshotMatches(rows, products, options = {}) {
  const { preferCanonical = false, allowZeroVariants = false } = options;
  const matched = [];
  const missing = [];
  const ambiguous = [];
  const variantBlocked = [];
  const skippedZeroVariants = [];
  const duplicates = [];
  for (const row of rows) {
    const nameKey = normalizeProductName(row.name);
    const exactNameCandidates = nameKey
      ? products.filter((product) => normalizeProductName(product.name) === nameKey)
      : [];
    const prefixNameCandidates = nameKey
      ? products.filter((product) => normalizeProductName(product.name).startsWith(`${nameKey} `))
      : [];
    let candidates = exactNameCandidates.length ? exactNameCandidates : prefixNameCandidates;
    let matchBy = exactNameCandidates.length ? 'name' : 'name-prefix';

    // Nama produk dari laporan lama adalah identitas yang diprioritaskan.
    // SKU hanya menjadi cadangan bila nama tidak menghasilkan kandidat.
    // Nama tidak boleh menjadi tebakan ketika ada lebih dari satu kandidat.
    if (!candidates.length) {
      const key = normalizeTransferSku(row.sku);
      candidates = products.filter((product) => normalizeTransferSku(product.sku) === key);
      matchBy = 'sku-fallback';
    }
    if (!candidates.length) {
      missing.push(row);
      continue;
    }
    if (candidates.length > 1 && !preferCanonical) {
      ambiguous.push({ ...row, candidates: candidates.map((product) => ({ id: product.id, sku: product.sku, name: product.name })) });
      continue;
    }
    if (candidates.length > 1) {
      const [selected, ...discarded] = [...candidates].sort(compareCanonicalProducts);
      duplicates.push({ ...row, selected, discarded });
      candidates = [selected];
      matchBy = `${matchBy}-canonical`;
    }
    const product = candidates[0];
    if (Number(product.variant_count || 0) > 0) {
      if (allowZeroVariants && row.quantity === 0) {
        skippedZeroVariants.push({ ...row, product, matchBy });
        continue;
      }
      variantBlocked.push({ ...row, product, matchBy });
      continue;
    }
    matched.push({ ...row, product, matchBy });
  }
  return {
    matched,
    missing,
    ambiguous,
    variantBlocked,
    skippedZeroVariants,
    duplicates,
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
  if (plan.skippedZeroVariants.length) console.log(`  Varian snapshot 0 (tidak diubah): ${JSON.stringify(plan.skippedZeroVariants.map((row) => row.sku))}`);
  if (plan.duplicates.length) {
    console.log(`  Katalog canonical dipilih: ${JSON.stringify(plan.duplicates.map((row) => ({
      snapshot: row.sku,
      dipakai: row.selected.id,
      dilewati: row.discarded.map((product) => ({ id: product.id, sku: product.sku, stock: product.stock })),
    })))}`);
    const manual = plan.duplicates.flatMap((row) => row.discarded
      .filter((product) => Number(product.stock || 0) !== 0)
      .map((product) => ({ snapshot: row.sku, id: product.id, sku: product.sku, setStock: 0 })));
    if (manual.length) console.log(`  Input manual setelah apply (duplikat stok nonzero): ${JSON.stringify(manual)}`);
  }
  const nameMatches = plan.matched.filter((row) => row.matchBy.startsWith('name'));
  if (nameMatches.length) console.log(`  Cocok lewat nama (SKU format berbeda): ${JSON.stringify(nameMatches.map((row) => row.sku))}`);
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((arg) => !arg.startsWith('--'));
  const apply = args.includes('--apply');
  const preferCanonical = args.includes('--prefer-canonical');
  const allowZeroVariants = args.includes('--allow-zero-variants');
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
      const plan = planSnapshotMatches(targetRows, products, { preferCanonical, allowZeroVariants });
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
      const plannedRows = plans.reduce((sum, item) => sum + item.plan.matched.length + item.plan.skippedZeroVariants.length, 0);
      console.log(`🔎 Preview selesai: ${plannedRows} baris dipetakan · total snapshot dua tujuan: ${totalQty} pcs. Database tidak berubah.`);
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
