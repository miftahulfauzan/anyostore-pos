#!/usr/bin/env node
// One-time, guarded reset of operational data for Toko B and Anyostore Metro.
// Audit and apply are deliberately separate. Apply requires the exact audit
// fingerprint, an on-server backup location, and records a durable run marker.
const crypto = require('crypto');
const db = require('../src/db');
const { TARGET_NAME_GROUPS, pickUniqueBranch } = require('../src/reset-branch-targets');
const { executeAuditQuery, countAuditRows } = require('../src/reset-audit-query');
const { findUnclassifiedBranchTables } = require('../src/reset-branch-table-policy');
const { withClosedPool } = require('../src/with-closed-pool');

const OPERATION = 'reset-store-catalog-v1';
const SOURCE_NAMES = ['Gudang Utama'];

function placeholders(values) {
  if (!values.length) throw new Error('Expected a non-empty ID list');
  return values.map(() => '?').join(',');
}

async function findExactBranch(connection, names, description) {
  const marks = placeholders(names);
  const [rows] = await connection.execute(
    `SELECT id, name, type, is_active FROM branches WHERE name IN (${marks}) ORDER BY id`,
    names
  );
  let candidates = rows;
  let available = rows;
  if (rows.length !== 1) {
    const [allBranches] = await connection.execute('SELECT id, name, type, is_active FROM branches ORDER BY id');
    candidates = allBranches;
    available = allBranches;
  }
  const branch = pickUniqueBranch(candidates, names, description, available);
  if (Number(branch.is_active) !== 1) throw new Error(`${description} is inactive: ${branch.name} (id ${branch.id})`);
  return branch;
}

async function resolveBranches(connection) {
  const source = await findExactBranch(connection, SOURCE_NAMES, 'Source branch');
  const targets = [];
  for (const names of TARGET_NAME_GROUPS) {
    targets.push(await findExactBranch(connection, names, 'Target branch'));
  }
  const targetIds = [...new Set(targets.map((branch) => Number(branch.id)))].sort((a, b) => a - b);
  if (targetIds.length !== TARGET_NAME_GROUPS.length || targetIds.includes(Number(source.id))) {
    throw new Error('Source and target branch identities are not distinct');
  }
  return { source, targets, targetIds };
}

async function count(connection, sql, params = []) {
  const sourceTable = sql.match(/\bFROM\s+`?([\w]+)`?/i)?.[1] || 'query';
  return countAuditRows(connection, sourceTable, sql, params);
}

async function makeAudit(connection) {
  const { source, targets, targetIds } = await resolveBranches(connection);
  const targetMarks = placeholders(targetIds);
  const sourceCatalog = await executeAuditQuery(connection, 'source catalog counts',
    `SELECT COUNT(*) AS products,
       (SELECT COUNT(*) FROM product_variants v JOIN products p2 ON p2.id=v.product_id WHERE p2.branch_id=? AND p2.is_active=TRUE AND v.is_active=TRUE) AS variants,
       (SELECT COUNT(*) FROM product_photos ph JOIN products p3 ON p3.id=ph.product_id WHERE p3.branch_id=? AND p3.is_active=TRUE) AS photos,
       (SELECT COUNT(*) FROM wholesale_prices wp JOIN products p4 ON p4.id=wp.product_id WHERE p4.branch_id=? AND p4.is_active=TRUE AND wp.is_active=TRUE) AS wholesale_prices
     FROM products WHERE branch_id=? AND is_active=TRUE`,
    [source.id, source.id, source.id, source.id]
  );
  if (Number(sourceCatalog[0]?.products || 0) < 1) throw new Error('Gudang Utama has no active products');

  const targetWarehouses = {};
  const targetCatalog = {};
  for (const target of targets) {
    const warehouses = await executeAuditQuery(connection, `warehouses for ${target.name}`,
      'SELECT id, name, type, is_active FROM warehouses WHERE branch_id=? ORDER BY id',
      [target.id]
    );
    const activeWarehouses = warehouses.filter((warehouse) => Number(warehouse.is_active) === 1);
    if (!activeWarehouses.length) throw new Error(`Target ${target.name} has no active warehouse`);
    targetWarehouses[target.name] = warehouses.map((warehouse) => Number(warehouse.id));
    const catalog = await executeAuditQuery(connection, `catalog counts for ${target.name}`,
      `SELECT COUNT(*) AS products,
         (SELECT COUNT(*) FROM product_variants v JOIN products p2 ON p2.id=v.product_id WHERE p2.branch_id=? AND p2.is_active=TRUE AND v.is_active=TRUE) AS variants,
         (SELECT COUNT(*) FROM product_photos ph JOIN products p3 ON p3.id=ph.product_id WHERE p3.branch_id=? AND p3.is_active=TRUE) AS photos,
         (SELECT COUNT(*) FROM wholesale_prices wp JOIN products p4 ON p4.id=wp.product_id WHERE p4.branch_id=? AND p4.is_active=TRUE AND wp.is_active=TRUE) AS wholesale_prices
       FROM products WHERE branch_id=? AND is_active=TRUE`,
      [target.id, target.id, target.id, target.id]
    );
    targetCatalog[target.name] = Object.fromEntries(
      Object.entries(catalog[0]).map(([key, value]) => [key, Number(value)])
    );
  }

  const customerRows = await executeAuditQuery(connection, 'target customer counts',
    `SELECT COUNT(*) AS count FROM customers WHERE branch_id IN (${targetMarks})`, targetIds
  );
  const userRows = await executeAuditQuery(connection, 'target user counts',
    `SELECT COUNT(*) AS count FROM users WHERE branch_id IN (${targetMarks})`, targetIds
  );
  const transferRows = await executeAuditQuery(connection, 'target transfer counts',
    `SELECT COUNT(*) AS count FROM stock_transfers st
       JOIN warehouses fw ON fw.id=st.from_warehouse_id
       JOIN warehouses tw ON tw.id=st.to_warehouse_id
     WHERE st.branch_id IN (${targetMarks}) OR fw.branch_id IN (${targetMarks}) OR tw.branch_id IN (${targetMarks})`,
    [...targetIds, ...targetIds, ...targetIds]
  );

  const counts = {
    sales: await count(connection, `SELECT COUNT(*) AS count FROM transactions WHERE branch_id IN (${targetMarks})`, targetIds),
    saleItems: await count(connection, `SELECT COUNT(*) AS count FROM transaction_items i JOIN transactions t ON t.id=i.transaction_id WHERE t.branch_id IN (${targetMarks})`, targetIds),
    salePayments: await count(connection, `SELECT COUNT(*) AS count FROM transaction_payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.branch_id IN (${targetMarks})`, targetIds),
    returns: await count(connection, `SELECT COUNT(*) AS count FROM returns r LEFT JOIN transactions t ON t.id=r.transaction_id WHERE r.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})`, [...targetIds, ...targetIds]),
    returnItems: await count(connection, `SELECT COUNT(*) AS count FROM return_items ri JOIN returns r ON r.id=ri.return_id LEFT JOIN transactions t ON t.id=r.transaction_id WHERE r.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})`, [...targetIds, ...targetIds]),
    heldSales: await count(connection, `SELECT COUNT(*) AS count FROM pending_transactions WHERE branch_id IN (${targetMarks})`, targetIds),
    purchaseOrders: await count(connection, `SELECT COUNT(*) AS count FROM purchase_orders WHERE branch_id IN (${targetMarks})`, targetIds),
    purchaseItems: await count(connection, `SELECT COUNT(*) AS count FROM purchase_order_items i JOIN purchase_orders p ON p.id=i.po_id WHERE p.branch_id IN (${targetMarks})`, targetIds),
    incomeExpenses: await count(connection, `SELECT COUNT(*) AS count FROM expenses WHERE branch_id IN (${targetMarks})`, targetIds),
    recurringExpenseSchedules: await count(connection, `SELECT COUNT(*) AS count FROM expense_schedules s JOIN expenses e ON e.id=s.expense_id WHERE e.branch_id IN (${targetMarks})`, targetIds),
    journals: await count(connection, `SELECT COUNT(*) AS count FROM journal_entries WHERE branch_id IN (${targetMarks})`, targetIds),
    journalItems: await count(connection, `SELECT COUNT(*) AS count FROM journal_entry_items i JOIN journal_entries j ON j.id=i.journal_id WHERE j.branch_id IN (${targetMarks})`, targetIds),
    cashDrawers: await count(connection, `SELECT COUNT(*) AS count FROM cash_drawers WHERE branch_id IN (${targetMarks})`, targetIds),
    cashMovements: await count(connection, `SELECT COUNT(*) AS count FROM cash_drawer_movements m JOIN cash_drawers c ON c.id=m.cash_drawer_id WHERE c.branch_id IN (${targetMarks})`, targetIds),
    stockMutations: await count(connection, `SELECT COUNT(*) AS count FROM stock_mutations sm LEFT JOIN warehouses w ON w.id=sm.warehouse_id JOIN products p ON p.id=sm.product_id WHERE sm.branch_id IN (${targetMarks}) OR w.branch_id IN (${targetMarks}) OR p.branch_id IN (${targetMarks})`, [...targetIds, ...targetIds, ...targetIds]),
    stockOpnames: await count(connection, `SELECT COUNT(*) AS count FROM stock_opnames WHERE branch_id IN (${targetMarks}) OR warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetIds, ...targetIds]),
    stockOpnameItems: await count(connection, `SELECT COUNT(*) AS count FROM stock_opname_items i JOIN stock_opnames o ON o.id=i.opname_id WHERE o.branch_id IN (${targetMarks}) OR o.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetIds, ...targetIds]),
    stockTransfers: Number(transferRows[0]?.count || 0),
    stockTransferItems: await count(connection, `SELECT COUNT(*) AS count FROM stock_transfer_items i JOIN stock_transfers st ON st.id=i.transfer_id JOIN warehouses fw ON fw.id=st.from_warehouse_id JOIN warehouses tw ON tw.id=st.to_warehouse_id WHERE st.branch_id IN (${targetMarks}) OR fw.branch_id IN (${targetMarks}) OR tw.branch_id IN (${targetMarks})`, [...targetIds, ...targetIds, ...targetIds]),
    commissions: await count(connection, `SELECT COUNT(*) AS count FROM commission_records WHERE branch_id IN (${targetMarks})`, targetIds),
    commissionItems: await count(connection, `SELECT COUNT(*) AS count FROM commission_items i JOIN commission_records c ON c.id=i.record_id WHERE c.branch_id IN (${targetMarks})`, targetIds),
    shifts: await count(connection, `SELECT COUNT(*) AS count FROM shifts WHERE branch_id IN (${targetMarks})`, targetIds),
    loyaltyEntries: await count(connection, `SELECT COUNT(*) AS count FROM loyalty_points WHERE customer_id IN (SELECT id FROM customers WHERE branch_id IN (${targetMarks}))`, targetIds),
    idempotencyRequests: await count(connection, `SELECT COUNT(*) AS count FROM inventory_requests WHERE user_id IN (SELECT id FROM users WHERE branch_id IN (${targetMarks}))`, targetIds),
  };

  const cross = {
    transfersTouchingOtherBranches: await count(connection, `SELECT COUNT(*) AS count FROM stock_transfers st JOIN warehouses fw ON fw.id=st.from_warehouse_id JOIN warehouses tw ON tw.id=st.to_warehouse_id WHERE (fw.branch_id IN (${targetMarks}) OR tw.branch_id IN (${targetMarks})) AND (st.branch_id NOT IN (${targetMarks}) OR fw.branch_id NOT IN (${targetMarks}) OR tw.branch_id NOT IN (${targetMarks}))`, [...targetIds, ...targetIds, ...targetIds, ...targetIds, ...targetIds]),
    mutationsTouchingOtherBranches: await count(connection, `SELECT COUNT(*) AS count FROM stock_mutations sm LEFT JOIN warehouses w ON w.id=sm.warehouse_id JOIN products p ON p.id=sm.product_id WHERE (sm.branch_id IN (${targetMarks}) OR w.branch_id IN (${targetMarks}) OR p.branch_id IN (${targetMarks})) AND (sm.branch_id NOT IN (${targetMarks}) OR p.branch_id NOT IN (${targetMarks}) OR (w.id IS NOT NULL AND w.branch_id NOT IN (${targetMarks})))`, [...targetIds, ...targetIds, ...targetIds, ...targetIds, ...targetIds, ...targetIds]),
    salesUsingTargetCustomersElsewhere: await count(connection, `SELECT COUNT(*) AS count FROM transactions t JOIN customers c ON c.id=t.customer_id WHERE c.branch_id IN (${targetMarks}) AND t.branch_id NOT IN (${targetMarks})`, [...targetIds, ...targetIds]),
    crossBranchReturns: await count(connection, `SELECT COUNT(*) AS count FROM returns r JOIN transactions t ON t.id=r.transaction_id WHERE (r.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})) AND (r.branch_id NOT IN (${targetMarks}) OR t.branch_id NOT IN (${targetMarks}))`, [...targetIds, ...targetIds, ...targetIds, ...targetIds]),
    crossBranchCommissionItems: await count(connection, `SELECT COUNT(*) AS count FROM commission_items i JOIN commission_records c ON c.id=i.record_id JOIN transactions t ON t.id=i.transaction_id WHERE (c.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})) AND (c.branch_id NOT IN (${targetMarks}) OR t.branch_id NOT IN (${targetMarks}))`, [...targetIds, ...targetIds, ...targetIds, ...targetIds]),
  };

  const branchColumns = await executeAuditQuery(connection, 'branch-scoped table discovery',
    `SELECT DISTINCT TABLE_NAME AS tableName FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='branch_id' ORDER BY TABLE_NAME`
  );
  const branchTableCounts = {};
  for (const { tableName } of branchColumns) {
    const escaped = `\`${String(tableName).replace(/`/g, '``')}\``;
    const tableCount = await countAuditRows(
      connection,
      `branch table ${tableName}`,
      `SELECT COUNT(*) AS count FROM ${escaped} WHERE branch_id IN (${targetMarks})`,
      targetIds
    );
    if (tableCount) {
      branchTableCounts[tableName] = tableCount;
    }
  }
  const unclassifiedBranchTables = findUnclassifiedBranchTables(
    Object.entries(branchTableCounts).map(([table, rows]) => ({ table, rows }))
  );

  const branchKey = `${OPERATION}:${source.id}:${targetIds.join(',')}`;
  const runRows = await executeAuditQuery(connection, 'previous reset marker lookup',
    'SELECT id, completed_at FROM branch_maintenance_runs WHERE branch_key=? LIMIT 1',
    [branchKey]
  );
  const stockSummary = await executeAuditQuery(connection, 'target stock totals',
    `SELECT COALESCE(SUM(ws.quantity),0) AS quantity, COALESCE(SUM(ws.reserved_quantity),0) AS reserved
     FROM warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id WHERE w.branch_id IN (${targetMarks})`, targetIds
  );

  const blockers = [];
  for (const [name, value] of Object.entries(cross)) if (value) blockers.push(`${name}=${value}`);
  for (const entry of unclassifiedBranchTables) blockers.push(`unclassified table ${entry.table}=${entry.rows}`);
  if (runRows.length) blockers.push('reset marker already exists');
  const fingerprintData = { sourceId: Number(source.id), targetIds, counts, cross, unclassifiedBranchTables };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');

  return {
    operation: OPERATION,
    fingerprint,
    source: { id: Number(source.id), name: source.name, type: source.type, catalog: Object.fromEntries(Object.entries(sourceCatalog[0]).map(([key, value]) => [key, Number(value)])) },
    targets: targets.map((branch) => ({
      id: Number(branch.id), name: branch.name, type: branch.type,
      warehouseIds: targetWarehouses[branch.name],
      catalog: targetCatalog[branch.name],
    })),
    counts,
    preservedMasterCounts: { customers: Number(customerRows[0]?.count || 0), users: Number(userRows[0]?.count || 0) },
    stockBeforeReset: { quantity: Number(stockSummary[0]?.quantity || 0), reserved: Number(stockSummary[0]?.reserved || 0) },
    branchTableCounts,
    crossBranchReferences: cross,
    unclassifiedBranchTables,
    resetAlreadyCompleted: runRows.length > 0,
    blockers,
  };
}

async function verifyCatalog(connection, sourceId, targets) {
  const getCounts = async (branchId) => {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS products,
         (SELECT COUNT(*) FROM product_variants v JOIN products p2 ON p2.id=v.product_id WHERE p2.branch_id=? AND p2.is_active=TRUE AND v.is_active=TRUE) AS variants,
         (SELECT COUNT(*) FROM product_photos ph JOIN products p3 ON p3.id=ph.product_id WHERE p3.branch_id=? AND p3.is_active=TRUE) AS photos,
         (SELECT COUNT(*) FROM wholesale_prices wp JOIN products p4 ON p4.id=wp.product_id WHERE p4.branch_id=? AND p4.is_active=TRUE AND wp.is_active=TRUE) AS wholesale_prices
       FROM products WHERE branch_id=? AND is_active=TRUE`,
      [branchId, branchId, branchId, branchId]
    );
    return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
  };
  const source = await getCounts(sourceId);
  const result = {};
  for (const target of targets) {
    const actual = await getCounts(target.id);
    result[target.name] = actual;
    for (const key of Object.keys(source)) {
      if (source[key] !== actual[key]) throw new Error(`Catalog mismatch at ${target.name}: ${key} source=${source[key]} target=${actual[key]}`);
    }
  }
  return { source, targets: result };
}

async function applyReset(expectedFingerprint, backupLocation, initiatedBy) {
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint || '')) throw new Error('Apply requires a 64-character audit fingerprint');
  if (!String(backupLocation || '').startsWith('/home/ubuntu/anyostore-backups/branch-resets/')) throw new Error('Backup location must be inside the protected VPS backup directory');
  if (!initiatedBy || String(initiatedBy).length > 100) throw new Error('Missing or invalid GitHub actor');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const context = await resolveBranches(connection);
    const { source, targets, targetIds } = context;
    await connection.execute(`SELECT id FROM branches WHERE id IN (${placeholders(targetIds)}) FOR UPDATE`, targetIds);
    const audit = await makeAudit(connection);
    if (audit.fingerprint !== expectedFingerprint) throw new Error(`Production data changed since audit; expected ${expectedFingerprint}, current ${audit.fingerprint}`);
    if (audit.blockers.length) throw new Error(`Reset blocked: ${audit.blockers.join('; ')}`);
    const catalog = await verifyCatalog(connection, source.id, targets);

    const targetMarks = placeholders(targetIds);
    const targetParams = targetIds;
    await connection.execute(`DELETE ri FROM return_items ri JOIN returns r ON r.id=ri.return_id LEFT JOIN transactions t ON t.id=r.transaction_id WHERE r.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})`, [...targetParams, ...targetParams]);
    await connection.execute(`DELETE ci FROM commission_items ci JOIN commission_records c ON c.id=ci.record_id JOIN transactions t ON t.id=ci.transaction_id WHERE c.branch_id IN (${targetMarks}) OR t.branch_id IN (${targetMarks})`, [...targetParams, ...targetParams]);
    await connection.execute(`DELETE p FROM transaction_payments p JOIN transactions t ON t.id=p.transaction_id WHERE t.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE i FROM transaction_items i JOIN transactions t ON t.id=i.transaction_id WHERE t.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM returns WHERE branch_id IN (${targetMarks}) OR transaction_id IN (SELECT id FROM transactions WHERE branch_id IN (${targetMarks}))`, [...targetParams, ...targetParams]);
    await connection.execute(`DELETE FROM commission_records WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM transactions WHERE branch_id IN (${targetMarks})`, targetParams);

    await connection.execute(`DELETE i FROM purchase_order_items i JOIN purchase_orders p ON p.id=i.po_id WHERE p.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM purchase_orders WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE s FROM expense_schedules s JOIN expenses e ON e.id=s.expense_id WHERE e.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM expenses WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE i FROM journal_entry_items i JOIN journal_entries j ON j.id=i.journal_id WHERE j.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM journal_entries WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE m FROM cash_drawer_movements m JOIN cash_drawers c ON c.id=m.cash_drawer_id WHERE c.branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM cash_drawers WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE i FROM stock_opname_items i JOIN stock_opnames o ON o.id=i.opname_id WHERE o.branch_id IN (${targetMarks}) OR o.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetParams, ...targetParams]);
    await connection.execute(`DELETE i FROM stock_transfer_items i JOIN stock_transfers st ON st.id=i.transfer_id WHERE st.branch_id IN (${targetMarks}) OR st.from_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks})) OR st.to_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetParams, ...targetParams, ...targetParams]);
    await connection.execute(`DELETE FROM stock_opnames WHERE branch_id IN (${targetMarks}) OR warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetParams, ...targetParams]);
    await connection.execute(`DELETE FROM stock_transfers WHERE branch_id IN (${targetMarks}) OR from_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks})) OR to_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${targetMarks}))`, [...targetParams, ...targetParams, ...targetParams]);
    await connection.execute(`DELETE sm FROM stock_mutations sm LEFT JOIN warehouses w ON w.id=sm.warehouse_id JOIN products p ON p.id=sm.product_id WHERE sm.branch_id IN (${targetMarks}) OR w.branch_id IN (${targetMarks}) OR p.branch_id IN (${targetMarks})`, [...targetParams, ...targetParams, ...targetParams]);
    await connection.execute(`DELETE FROM pending_transactions WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM shifts WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`DELETE FROM inventory_requests WHERE user_id IN (SELECT id FROM users WHERE branch_id IN (${targetMarks}))`, targetParams);
    await connection.execute(`DELETE FROM loyalty_points WHERE customer_id IN (SELECT id FROM customers WHERE branch_id IN (${targetMarks}))`, targetParams);
    await connection.execute(`UPDATE customers SET loyalty_points=0, membership_tier='bronze', total_purchases=0, total_spent=0, last_purchase=NULL WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`UPDATE expense_budgets SET spent_amount=0 WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`UPDATE products SET stock=0 WHERE branch_id IN (${targetMarks})`, targetParams);
    await connection.execute(`UPDATE product_variants SET stock=0 WHERE product_id IN (SELECT id FROM products WHERE branch_id IN (${targetMarks}))`, targetParams);
    await connection.execute(`UPDATE warehouse_stocks ws JOIN warehouses w ON w.id=ws.warehouse_id SET ws.quantity=0, ws.reserved_quantity=0, ws.revision=ws.revision+1 WHERE w.branch_id IN (${targetMarks})`, targetParams);

    const after = await makeAudit(connection);
    const remaining = Object.entries(after.counts).filter(([, value]) => value !== 0);
    if (remaining.length) throw new Error(`Post-reset verification failed: ${JSON.stringify(remaining)}`);
    if (after.stockBeforeReset.quantity !== 0 || after.stockBeforeReset.reserved !== 0) throw new Error('Post-reset stock verification failed');

    const branchKey = `${OPERATION}:${source.id}:${targetIds.join(',')}`;
    await connection.execute(
      `INSERT INTO branch_maintenance_runs
        (operation, branch_key, source_branch_id, target_branch_ids, audit_fingerprint, backup_location, initiated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [OPERATION, branchKey, source.id, JSON.stringify(targetIds), expectedFingerprint, backupLocation, initiatedBy]
    );
    await connection.commit();
    return { success: true, source: source.name, targets: targets.map(({ id, name }) => ({ id: Number(id), name })), catalog, deleted: audit.counts, remaining: after.counts, stockAfterReset: after.stockBeforeReset, backupLocation };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const [mode, fingerprint, backupLocation, initiatedBy] = process.argv.slice(2);
  const result = await withClosedPool(db, async () => {
    if (!['audit', 'verify', 'apply'].includes(mode)) {
      throw new Error('Usage: reset-target-branch-data.js <audit|verify|apply> [fingerprint] [backup-location] [actor]');
    }
    if (mode === 'apply') return applyReset(fingerprint, backupLocation, initiatedBy);

    const connection = await db.getConnection();
    try {
      const audit = await makeAudit(connection);
      if (mode === 'verify') {
        if (audit.fingerprint !== fingerprint) throw new Error(`Fingerprint mismatch: current=${audit.fingerprint}`);
        if (audit.blockers.length) throw new Error(`Reset blocked: ${audit.blockers.join('; ')}`);
        return { valid: true, fingerprint: audit.fingerprint };
      }
      return audit;
    } finally {
      connection.release();
    }
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
