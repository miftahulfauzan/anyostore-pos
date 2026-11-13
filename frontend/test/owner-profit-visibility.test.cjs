const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'app');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('web report sections receive the role and limit margin/net profit to owners', () => {
  const dashboard = read('dashboard/page.js');
  const reports = read('reports/page.js');
  const sections = read('dashboard/OlseraDashboardSections.js');

  assert.match(dashboard, /<OlseraDashboardSections[\s\S]*role=\{role\}/);
  assert.match(reports, /<OlseraDashboardSections[\s\S]*role=\{user\?\.role\}/);
  assert.match(sections, /const isOwner = role === 'owner';/);
  assert.match(sections, /const hasProfit = isOwner && reportData\?\.summary\?\.net_profit != null;/);
  assert.match(sections, /isOwner && <div className="dashboard-overview-footline">/);
});
