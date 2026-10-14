const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('PO receipt persists received quantity before checking remaining items', () => {
  const route = source('src/routes/purchase-orders.js');
  assert.match(route, /UPDATE purchase_order_items SET received_qty = received_qty \+ \?/);
  assert.ok(route.indexOf('UPDATE purchase_order_items SET received_qty') < route.indexOf('SELECT COUNT(*) AS count FROM purchase_order_items'));
});

test('PO creation checks product branch and variant ownership', () => {
  const route = source('src/routes/purchase-orders.js');
  assert.match(route, /FROM products WHERE id = \? AND branch_id = \?/);
  assert.match(route, /FROM product_variants WHERE id = \? AND product_id = \?/);
});

test('direct mutation checks variant ownership before stock adjustment', () => {
  const route = source('src/routes/inventory.js');
  const mutation = route.slice(route.indexOf("router.post('/mutations'"), route.indexOf("router.get('/incoming/targets'"));
  assert.match(mutation, /FROM product_variants WHERE id = \? AND product_id = \?/);
  assert.ok(mutation.indexOf('FROM product_variants WHERE') < mutation.indexOf('adjustStock(connection'));
});

test('month branch dashboard uses calendar-month boundary', () => {
  const route = source('src/routes/dashboard.js');
  const monthly = route.match(/AS month_(?:sales|transactions)/g) || [];
  assert.equal(monthly.length, 3);
  assert.doesNotMatch(route, /INTERVAL 29 DAY\)\), 0\) AS month_/);
});

test('payment audit uses shared sales statuses', () => {
  const audit = source('scripts/audit-payments.js');
  assert.match(audit, /SALES_STATUSES_SQL/);
  assert.doesNotMatch(audit, /'completed','partially_cancelled','refunded'/);
});

test('product revenue excludes cancelled and returned item quantities', () => {
  const report = source('src/routes/reports.js');
  const productQuery = report.slice(report.indexOf('SELECT ti.product_id, MAX(ti.product_name)'), report.indexOf('GROUP BY ti.product_id'));
  assert.match(productQuery, /ti\.quantity - ti\.cancelled_qty - ti\.returned_qty/);
  assert.doesNotMatch(productQuery, /t\.grand_total - t\.cancelled_amount - t\.refunded_amount/);
});
