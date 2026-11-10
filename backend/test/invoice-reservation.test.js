const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'transactions.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261110_invoice_reservations.sql'), 'utf8');

test('reservasi nomor invoice tersedia untuk tombol bagikan POS', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS invoice_reservations/);
  assert.match(migration, /invoice_no VARCHAR\(64\) NOT NULL/);
  assert.match(source, /router\.post\('\/invoice-preview'/);
  assert.match(source, /INSERT INTO invoice_reservations/);
  // Nomor dipakai ulang saat checkout supaya tidak berubah.
  assert.match(source, /SELECT invoice_no, used_at FROM invoice_reservations WHERE client_transaction_id = \?/);
  assert.match(source, /UPDATE invoice_reservations SET used_at = NOW\(\)/);
  // Nomor tetap diambil dari urutan invoice yang sama.
  assert.match(source, /const invoiceNo = await nextInvoice\(connection, branchId, transactionDate\)/);
});
