const { money } = require('./money');

function cashFlowNet({ manualNet = 0, financeIncome = 0, financeExpense = 0 } = {}) {
  return money(Number(manualNet || 0) + Number(financeIncome || 0) - Number(financeExpense || 0));
}

module.exports = { cashFlowNet };
