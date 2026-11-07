const test = require('node:test');
const assert = require('node:assert/strict');
const { cashFlowNet } = require('../src/cash-flow');

test('cash flow combines manual cash movement with cash finance income and expense', () => {
  const net = cashFlowNet({
    manualNet: -25000,
    financeIncome: 100000,
    financeExpense: 760000,
  });

  assert.equal(net, -685000);
});

test('cash flow treats omitted aggregates as zero', () => {
  assert.equal(cashFlowNet({}), 0);
  assert.equal(cashFlowNet({ manualNet: 50000 }), 50000);
});

test('cash flow keeps the cent precision used by money helper', () => {
  assert.equal(cashFlowNet({ financeIncome: 0.1, financeExpense: 0.03 }), 0.07);
});
