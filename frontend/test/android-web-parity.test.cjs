const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const webDashboard = read('frontend/app/dashboard/page.js');
const webDashboardSections = read('frontend/app/dashboard/OlseraDashboardSections.js');
const mobileReports = read('mobile/lib/src/reports_page.dart');
const backendReports = read('backend/src/routes/reports.js');
const webClosing = read('frontend/app/closing/page.js');
const mobileApi = read('mobile/lib/src/api_client.dart');
const mobilePrinter = read('mobile/lib/src/printer_service.dart');
const webHistory = read('frontend/app/history/page.js');
const mobileHistory = read('mobile/lib/src/history_tab.dart');
const webExpenses = read('frontend/app/expenses/page.js');
const mobileFinance = read('mobile/lib/src/finance_page.dart');

test('dashboard web and Android consume one selected-period contract', () => {
  const webDashboardContract = `${webDashboard}\n${webDashboardSections}`;
  for (const field of [
    'selected_period',
    'selected_summary',
    'selected_sales_trend',
    'selected_payment_breakdown',
    'selected_recent_transactions',
  ]) {
    assert.match(webDashboardContract, new RegExp(field), `web dashboard must use ${field}`);
  }
  for (const field of ['selected_period', 'selected_summary', 'selected_sales_trend']) {
    assert.match(mobileReports, new RegExp(field), `Android reports must use ${field}`);
  }
});

test('owner all-closing and Android closing print share the same contract', () => {
  assert.match(backendReports, /req\.query\.branch_id\s*===\s*['"]all['"]/);
  assert.match(webClosing, /activeBranchId\s*===\s*['"]all['"]\s*\?\s*['"]all['"]\s*:/);
  assert.match(mobileApi, /allBranches\s*=\s*false/);
  assert.match(mobileReports, /allBranches:\s*_isOwner\s*&&\s*_branchId\s*==\s*null/);
  assert.match(mobileReports, /['"]expenses['"]\s*:/);
  assert.match(mobileReports, /['"]income['"]\s*:/);
  assert.match(mobilePrinter, /Pengeluaran/);
  assert.match(mobilePrinter, /Pemasukan/);
});

test('transaction history defaults to today and uses twenty-row pages on both clients', () => {
  assert.match(webHistory, /useState\('today'\)/);
  assert.match(webHistory, /date_from \|\| todayStr\(\)/);
  assert.match(webHistory, /limit:\s*['"]20['"]/);
  assert.match(mobileHistory, /String\s+_preset\s*=\s*['"]thisMonth['"]/);
  assert.match(mobileHistory, /limit:\s*20/);
  assert.match(mobileHistory, /allBranches:\s*_isOwner\s*&&\s*branchId\s*==\s*null/);
  for (const key of ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'previousMonth']) {
    assert.match(mobileHistory, new RegExp(key), `Android history must expose ${key}`);
  }
});

test('finance filters expose one query contract for expense and income', () => {
  assert.match(webExpenses, /type:\s*currentType/);
  assert.match(webExpenses, /category_id/);
  assert.match(webExpenses, /payment_method/);
  assert.match(webExpenses, /search/);
  assert.match(mobileFinance, /expensesPage/);
  for (const field of ['dateFrom', 'dateTo', 'categoryId', 'paymentMethod', 'search', 'page', 'limit']) {
    assert.match(mobileFinance, new RegExp(field), `Android finance must use ${field}`);
  }
});
