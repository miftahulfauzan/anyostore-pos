#!/usr/bin/env node
// Import katalog + stok dari CSV export project lama.
// Preview (default): node scripts/import-products-from-csv.js /tmp/produk.csv
// Terapkan:          node scripts/import-products-from-csv.js /tmp/produk.csv --apply

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { adjustStock } = require('../src/stock');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.filter((values) => values.some((item) => item.trim() !== '')).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))
  );
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || null;
}

function numberOrZero(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

async function main() {
  const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const apply = process.argv.includes('--apply');
  if (!csvPath) throw new Error('Berikan path CSV. Contoh: node scripts/import-products-from-csv.js /tmp/produk.csv');

  const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'pos_pakaian',
    user: process.env.DB_USER || 'pos_user',
    password: process.env.DB_PASSWORD || '',
  });
  try {
    await connection.beginTransaction();
    const [branches] = await connection.execute(
      'SELECT id, name FROM branches WHERE LOWER(name)=LOWER(?) AND is_active=TRUE LIMIT 1',
      ['Gudang Utama']
    );
    if (!branches[0]) throw new Error('Cabang "Gudang Utama" tidak ditemukan.');
    const branchId = branches[0].id;
    const [warehouses] = await connection.execute(
      "SELECT id, name FROM warehouses WHERE branch_id=? AND type='utama' AND is_active=TRUE ORDER BY id LIMIT 1",
      [branchId]
    );
    if (!warehouses[0]) throw new Error('Gudang bertipe utama pada cabang Gudang Utama tidak ditemukan.');
    const warehouseId = warehouses[0].id;
    const [users] = await connection.execute(
      "SELECT id FROM users WHERE branch_id=? AND is_active=TRUE ORDER BY role='owner' DESC, id LIMIT 1",
      [branchId]
    );
    const userId = users[0]?.id || null;
    const referenceId = Date.now();
    const batchNumber = `IMPORT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const [categories] = await connection.execute('SELECT id, name FROM categories WHERE is_active=TRUE');
    const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category.id]));
    const [branchProducts] = await connection.execute('SELECT sku FROM products WHERE branch_id=? AND is_active=TRUE AND sku IS NOT NULL', [branchId]);
    const existingBranchSkus = new Set(branchProducts.map((product) => product.sku.toLowerCase()));
    const [allSkus] = await connection.execute('SELECT sku FROM products WHERE sku IS NOT NULL');
    const usedSkus = new Set(allSkus.map((product) => product.sku.toLowerCase()));

    let created = 0; let skipped = 0; let totalStock = 0;
    for (const row of rows) {
      const sku = String(row.SKU || '').trim();
      const name = String(row['Nama Produk'] || '').trim();
      const categoryName = String(row.Kategori || '').trim() || 'Lainnya';
      if (!sku || !name) throw new Error(`Baris CSV tidak valid: SKU/nama kosong (${JSON.stringify(row)})`);
      if (existingBranchSkus.has(sku.toLowerCase())) { skipped++; continue; }

      let categoryId = categoryByName.get(categoryName.toLowerCase());
      if (!categoryId) {
        if (apply) {
          const [insertedCategory] = await connection.execute(
            'INSERT INTO categories (name, slug, is_active) VALUES (?, ?, TRUE)',
            [categoryName, slugify(categoryName)]
          );
          categoryId = insertedCategory.insertId;
          categoryByName.set(categoryName.toLowerCase(), categoryId);
        } else categoryId = 0;
      }

      let targetSku = sku;
      if (usedSkus.has(targetSku.toLowerCase())) targetSku = `B${branchId}-${sku}`;
      let suffix = 2;
      while (usedSkus.has(targetSku.toLowerCase())) targetSku = `B${branchId}-${sku}-${suffix++}`;
      const barcode = String(row.Barcode || '').trim() || null;
      let productId;
      if (apply) {
        const [inserted] = await connection.execute(
          `INSERT INTO products (branch_id, category_id, name, description, sku, barcode, price, cost, stock, min_stock, gender, is_active)
           VALUES (?, ?, ?, NULL, ?, ?, 0, 0, 0, ?, 'unisex', TRUE)`,
          [branchId, categoryId, name, targetSku, barcode, numberOrZero(row['Min Stok']) || 5]
        );
        productId = inserted.insertId;
      }
      usedSkus.add(targetSku.toLowerCase());
      const quantity = numberOrZero(row.Stok);
      if (apply && quantity > 0) {
        await adjustStock(connection, {
          branchId, warehouseId, productId, variantId: null, delta: quantity,
          userId, type: 'adjustment', referenceType: 'csv_import', referenceId,
          batchNumber, notes: `Import dari export CSV ${path.basename(csvPath)}`,
        });
        totalStock += quantity;
      }
      created++;
    }
    if (apply) await connection.commit();
    else await connection.rollback();
    console.log(`${apply ? '✅ Import diterapkan' : '🔎 Preview (tidak mengubah database)'}`);
    console.log(`CSV: ${rows.length} baris · dibuat: ${created} · dilewati SKU sudah ada: ${skipped} · total stok: ${totalStock}`);
    console.log(`Tujuan: cabang ${branches[0].name} · gudang ${warehouses[0].name}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

if (require.main === module) main().catch((error) => { console.error(`❌ ${error.message}`); process.exit(1); });

module.exports = { parseCsv, numberOrZero };
