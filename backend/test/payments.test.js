const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePayments, paymentSummary, persistPayments } = require('../src/payments');

test('normalizePayments: tunai dengan kembalian', () => {
  const result = normalizePayments({ payment_method: 'cash', amount_paid: 100000 }, 95000);
  assert.equal(result.method, 'cash');
  assert.equal(result.paid, 100000);
  assert.equal(result.change, 5000);
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].amount, 95000);
});

test('persistPayments: header tunai memakai nominal dibayar, bukan total', async () => {
  const calls = [];
  const connection = { execute: async (sql, params) => { calls.push({ sql, params }); return []; } };
  const summary = normalizePayments({ payment_method: 'cash', amount_paid: 100000 }, 95000);
  await persistPayments(connection, 7, summary);
  const update = calls.find((c) => c.sql.includes('UPDATE transactions SET payment_method'));
  assert.deepEqual(update.params, ['cash', 100000, 5000, 7]);
});

test('normalizePayments: non-tunai harus sama dengan total', () => {
  const result = normalizePayments({ payment_method: 'qris', amount_paid: 95000 }, 95000);
  assert.equal(result.method, 'qris');
  assert.equal(result.change, 0);
});

test('normalizePayments: tunai kurang ditolak', () => {
  assert.throws(() => normalizePayments({ payment_method: 'cash', amount_paid: 90000 }, 95000), /kurang/);
});

test('normalizePayments: non-tunai tidak sesuai total ditolak', () => {
  assert.throws(() => normalizePayments({ payment_method: 'transfer', amount_paid: 90000 }, 95000), /sesuai total/);
});

test('normalizePayments: split total harus sama dengan transaksi', () => {
  const result = normalizePayments({
    payments: [
      { payment_method: 'cash', amount: 50000 },
      { payment_method: 'qris', amount: 45000 },
    ],
  }, 95000);
  assert.equal(result.method, 'split');
  assert.equal(result.paid, 95000);
  assert.equal(result.payments.length, 2);
});

test('normalizePayments: split tidak sama ditolak', () => {
  assert.throws(() => normalizePayments({
    payments: [
      { payment_method: 'cash', amount: 50000 },
      { payment_method: 'qris', amount: 40000 },
    ],
  }, 95000), /harus sama/);
});

test('paymentSummary: beberapa metode = split tanpa kembalian', () => {
  const summary = paymentSummary([
    { payment_method: 'cash', amount: 60000 },
    { payment_method: 'debit', amount: 40000 },
  ], 100000);
  assert.equal(summary.method, 'split');
  assert.equal(summary.paid, 100000);
  assert.equal(summary.change, 0);
});

test('persistPayments: tulis ulang payments + header transaksi', async () => {
  const calls = [];
  const connection = { execute: async (sql, params) => { calls.push({ sql, params }); return []; } };
  const summary = {
    method: 'split',
    paid: 95000,
    change: 0,
    payments: [
    { payment_method: 'cash', amount: 50000, reference: null },
    { payment_method: 'qris', amount: 45000, reference: 'REF-1' },
    ],
  };
  const result = await persistPayments(connection, 7, summary);

  assert.equal(calls[0].sql, 'DELETE FROM transaction_payments WHERE transaction_id = ?');
  assert.equal(calls[0].params[0], 7);
  assert.equal(calls.filter((c) => c.sql.includes('INSERT INTO transaction_payments')).length, 2);
  const update = calls.find((c) => c.sql.includes('UPDATE transactions SET payment_method'));
  assert.ok(update);
  assert.deepEqual(update.params, ['split', 95000, 0, 7]);
  assert.equal(result.method, 'split');
  assert.equal(result.paid, 95000);
});
