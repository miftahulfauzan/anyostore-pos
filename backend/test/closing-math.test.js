const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClosingMethods } = require('../src/closing-math');

test('penutupan: penjualan normal tanpa refund', () => {
  const { methods, expected_total } = buildClosingMethods({
    payments: [{ payment_method: 'cash', sales: 100000, cancellations: 0 }],
    returnsData: [],
    movementsNet: 0,
  });
  assert.equal(methods.cash.total, 100000);
  assert.equal(expected_total, 100000);
});

test('penutupan: refund retur tunai TIDAK dobel (hanya lewat returns)', () => {
  const { methods, expected_total } = buildClosingMethods({
    payments: [{ payment_method: 'cash', sales: 200000, cancellations: 0 }],
    returnsData: [{ refund_method: 'cash', cnt: 1, refund: 50000 }],
    movementsNet: 0,
  });
  // 200.000 - refund 50.000 = 150.000 (sekali potong, bukan 100.000)
  assert.equal(methods.cash.total, 150000);
  assert.equal(expected_total, 150000);
});

test('penutupan: pembatalan sebagian + refund tetap satu kali potong', () => {
  const { methods, expected_total } = buildClosingMethods({
    payments: [
      { payment_method: 'cash', sales: 300000, cancellations: 30000 },
      { payment_method: 'qris', sales: 200000, cancellations: 0 },
    ],
    returnsData: [{ refund_method: 'cash', cnt: 1, refund: 40000 }],
    movementsNet: 0,
  });
  assert.equal(methods.cash.total, 300000 - 30000 - 40000);
  assert.equal(methods.qris.total, 200000);
  assert.equal(expected_total, 300000 - 30000 - 40000 + 200000);
});

test('penutupan: refund tanpa metode didistribusikan proporsional', () => {
  const { methods, expected_total } = buildClosingMethods({
    payments: [
      { payment_method: 'cash', sales: 80000, cancellations: 0 },
      { payment_method: 'qris', sales: 20000, cancellations: 0 },
    ],
    returnsData: [{ refund_method: null, cnt: 1, refund: 10000 }],
    movementsNet: 0,
  });
  assert.equal(methods.cash.total, 80000 - 8000); // 80% dari 10.000
  assert.equal(methods.qris.total, 20000 - 2000); // 20% dari 10.000
  assert.equal(expected_total, 90000);
});

test('penutupan: kas masuk/keluar manual hanya memengaruhi metode cash', () => {
  const { methods } = buildClosingMethods({
    payments: [{ payment_method: 'cash', sales: 100000, cancellations: 0 }],
    returnsData: [],
    movementsNet: 25000,
  });
  assert.equal(methods.cash.cash_in_out, 25000);
  assert.equal(methods.cash.total, 125000);
});
