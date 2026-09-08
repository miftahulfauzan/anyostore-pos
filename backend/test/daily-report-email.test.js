const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { buildDailyEmailHtml, currentWibTime, isSafeEmailApiUrl } = require('../src/daily-report-email');

test('daily email hanya menerima endpoint Resend HTTPS', () => {
  assert.equal(isSafeEmailApiUrl('https://api.resend.com/emails'), true);
  assert.equal(isSafeEmailApiUrl('https://evil.example/emails'), false);
  assert.equal(isSafeEmailApiUrl('http://api.resend.com/emails'), false);
  assert.equal(isSafeEmailApiUrl('https://api.resend.com/emails?redirect=https://evil.example'), false);
});

test('daily email memakai waktu WIB dan melakukan escape data produk', () => {
  assert.equal(currentWibTime(new Date('2026-09-08T12:34:00.000Z')), '19:34');
  const html = buildDailyEmailHtml({
    branchName: '<Gudang Utama>',
    reportDate: '2026-09-08',
    totals: { incoming: 5, outgoing: 2 },
    products: [{ name: '<Denim>', sku: 'A&01', incoming: 5, outgoing: 2 }],
  });
  assert.match(html, /&lt;Gudang Utama&gt;/);
  assert.match(html, /&lt;Denim&gt;/);
  assert.match(html, /A&amp;01/);
  assert.doesNotMatch(html, /<Denim>/);
});
