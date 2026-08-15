// Perhitungan rincian metode bayar untuk Penutupan (daily-closing).
// Dipisah dari route supaya bisa di-UNIT-TEST — regression test refund dobel
// ada di test/closing-math.test.js.
const { money } = require('./money');

function buildClosingMethods({ payments, returnsData, movementsNet }) {
  const methods = {};
  let totalGross = 0;
  for (const p of payments) {
    methods[p.payment_method] = {
      sales: Number(p.sales),
      returns: 0,
      cancellations: Number(p.cancellations),
      cash_in_out: 0,
    };
    totalGross += Number(p.sales);
  }
  const knownRefunds = returnsData.filter((row) => row.refund_method);
  const unknownRefunds = returnsData.filter((row) => !row.refund_method);
  const unknownRefundTotal = unknownRefunds.reduce(
    (sum, row) => sum + Number(row.refund || 0),
    0
  );
  // Refund dihitung SATU KALI di sini (per metode refund). payments.cancellations
  // HANYA pembatalan — kalau refund ikut di cancellations hasilnya dobel.
  for (const row of knownRefunds) {
    const method = methods[row.refund_method];
    if (method) {
      method.returns = money(Number(method.returns || 0) + Number(row.refund || 0));
    }
  }
  if (unknownRefundTotal > 0 && totalGross > 0) {
    for (const m of Object.keys(methods)) {
      methods[m].returns = money(
        Number(methods[m].returns || 0) +
          (methods[m].sales / totalGross) * unknownRefundTotal
      );
    }
  }
  if (methods.cash) methods.cash.cash_in_out = Number(movementsNet || 0);
  let expectedTotal = 0;
  for (const m of Object.keys(methods)) {
    const v = methods[m];
    v.total = money(v.sales - v.returns - v.cancellations + v.cash_in_out);
    expectedTotal += Number(v.total);
  }
  return { methods, expected_total: money(expectedTotal) };
}

module.exports = { buildClosingMethods };
