// Sumber kebenaran pembayaran: transaction_payments.
// Kolom header transactions (payment_method, amount_paid, change) hanyalah
// ringkasan turunan dan SELALU ditulis ulang dari baris pembayaran, sehingga
// tidak mungkin melenceng.

const { money } = require('./money');

const paymentMethods = new Set(['cash', 'qris', 'debit', 'transfer', 'credit']);

function normalizePayments(body, grandTotal) {
  if (Array.isArray(body.payments) && body.payments.length) {
    const payments = body.payments.map((payment) => ({
      payment_method: payment.payment_method,
      amount: money(payment.amount),
      reference: payment.reference?.trim() || null,
    }));
    if (payments.some((payment) => !paymentMethods.has(payment.payment_method) || payment.amount <= 0)) {
      throw Object.assign(new Error('Data split payment tidak valid'), { status: 400 });
    }
    if (money(payments.reduce((sum, payment) => sum + payment.amount, 0)) !== grandTotal) {
      throw Object.assign(new Error('Total split payment harus sama dengan total transaksi'), { status: 400 });
    }
    return paymentSummary(payments, grandTotal);
  }

  const method = body.payment_method;
  const paid = money(body.amount_paid);
  if (!paymentMethods.has(method) || !Number.isFinite(paid) || paid < 0) {
    throw Object.assign(new Error('Metode atau nominal pembayaran tidak valid'), { status: 400 });
  }
  if (method === 'cash' && paid < grandTotal) {
    throw Object.assign(new Error('Pembayaran tunai kurang'), { status: 400 });
  }
  if (method !== 'cash' && paid !== grandTotal) {
    throw Object.assign(new Error('Pembayaran non-tunai harus sesuai total transaksi'), { status: 400 });
  }
  return paymentSummary(
    [{ payment_method: method, amount: grandTotal, reference: body.payment_reference?.trim() || null }],
    grandTotal,
    paid
  );
}

function paymentSummary(payments, grandTotal, paidOverride) {
  const paid = paidOverride != null ? money(paidOverride) : money(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const method = payments.length > 1 ? 'split' : payments[0]?.payment_method || null;
  const change = method === 'cash' && payments.length === 1 ? money(paid - grandTotal) : 0;
  return { method, paid, change, payments };
}

async function persistPayments(connection, transactionId, summary) {
  await connection.execute('DELETE FROM transaction_payments WHERE transaction_id = ?', [transactionId]);
  for (const payment of summary.payments) {
    await connection.execute(
      'INSERT INTO transaction_payments (transaction_id, payment_method, amount, reference) VALUES (?, ?, ?, ?)',
      [transactionId, payment.payment_method, payment.amount, payment.reference || null]
    );
  }
  await connection.execute(
    'UPDATE transactions SET payment_method = ?, amount_paid = ?, `change` = ? WHERE id = ?',
    [summary.method, summary.paid, summary.change, transactionId]
  );
  return summary;
}

module.exports = { normalizePayments, paymentSummary, persistPayments };
