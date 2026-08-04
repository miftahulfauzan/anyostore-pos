#!/usr/bin/env node
// Audit konsistensi pembayaran: bandingkan ringkasan header transactions
// (payment_method, amount_paid, change) dengan baris transaction_payments.
// READ-ONLY — tidak mengubah data. Jalankan di container backend:
//   node scripts/audit-payments.js

const db = require('../src/db');

async function main() {
  const [rows] = await db.execute(
    `SELECT t.id, t.invoice_no, t.branch_id, t.status, t.grand_total,
            t.payment_method AS header_method, t.amount_paid AS header_paid, t.\`change\` AS header_change,
            COALESCE(SUM(tp.amount), 0) AS payments_sum,
            COUNT(tp.id) AS payment_count,
            GROUP_CONCAT(DISTINCT tp.payment_method ORDER BY tp.payment_method SEPARATOR ',') AS payment_methods
     FROM transactions t
     LEFT JOIN transaction_payments tp ON tp.transaction_id = t.id
     WHERE t.status IN ('completed','partially_cancelled','refunded')
     GROUP BY t.id
     ORDER BY t.id`
  );

  const problems = [];
  for (const row of rows) {
    const grandTotal = Number(row.grand_total || 0);
    const paymentsSum = Number(row.payments_sum || 0);
    const headerPaid = Number(row.header_paid || 0);
    const headerChange = Number(row.header_change || 0);
    const methods = String(row.payment_methods || '').split(',').filter(Boolean);
    const expectedMethod = methods.length > 1 ? 'split' : methods[0] || null;

    if (paymentsSum !== grandTotal) {
      problems.push(`#${row.id} ${row.invoice_no}: total payments ${paymentsSum} != grand_total ${grandTotal}`);
    }
    if (expectedMethod && row.header_method !== expectedMethod) {
      problems.push(`#${row.id} ${row.invoice_no}: header method '${row.header_method}' != payments ('${row.payment_methods}')`);
    }
    if (methods.length === 1 && methods[0] === 'cash') {
      if (headerPaid < grandTotal) problems.push(`#${row.id} ${row.invoice_no}: amount_paid ${headerPaid} < grand_total ${grandTotal}`);
      if (headerChange !== headerPaid - grandTotal) problems.push(`#${row.id} ${row.invoice_no}: change ${headerChange} != ${headerPaid - grandTotal}`);
    } else if (methods.length && headerChange !== 0) {
      problems.push(`#${row.id} ${row.invoice_no}: change ${headerChange} harusnya 0 untuk ${row.payment_methods}`);
    }
  }

  console.log(`Transaksi dicek: ${rows.length}`);
  console.log(`Ketidaksesuaian: ${problems.length}`);
  for (const problem of problems.slice(0, 100)) console.log(' - ' + problem);
  if (problems.length > 100) console.log(`... dan ${problems.length - 100} lainnya.`);

  await db.end();
  if (problems.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
