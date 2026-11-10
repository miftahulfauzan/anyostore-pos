const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isExpectedRequestAbort } = require('../app/components/fetch-error-policy.cjs');

test('recognizes the aborted-signal message shown by the app', () => {
  assert.equal(isExpectedRequestAbort(new Error('signal is aborted without reason')), true);
});

test('recognizes standard AbortError without relying on its message', () => {
  assert.equal(isExpectedRequestAbort(Object.assign(new Error('aborted'), { name: 'AbortError' })), true);
});

test('recognizes a request whose supplied signal has been aborted', () => {
  assert.equal(isExpectedRequestAbort(new Error('request failed'), { aborted: true }), true);
});

test('keeps ordinary network errors eligible for an error notification', () => {
  assert.equal(isExpectedRequestAbort(new TypeError('Failed to fetch'), { aborted: false }), false);
});

test('global fetch wrapper filters expected cancellations before showing an error', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/components/NotificationCenter.js'), 'utf8');
  assert.match(source, /isExpectedRequestAbort\(error, requestSignal\)/);
  assert.match(source, /const expectedAbort = isExpectedRequestAbort\(error, requestSignal\)/);
  assert.match(source, /if \(expectedAbort\)[\s\S]*?else \{\s*show\('error'/);
});

test('aborting the final mutation also dismisses its loading notice', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/components/NotificationCenter.js'), 'utf8');
  assert.match(source, /if \(isMutation && pendingRequests\.current\.size === 1\)\s*\{\s*setNotice\(\(current\) => current\?\.type === 'loading' \? null : current\)/);
});

test('pesan penolakan akses menyebut endpoint yang ditolak', () => {
  const notification = fs.readFileSync(
    new URL('../app/components/NotificationCenter.js', `file://${__dirname}/`),
    'utf8',
  );
  // "Akses ditolak" tanpa konteks sulit dilacak; sertakan METHOD + path.
  assert.match(notification, /function requestDetail\(url, method, status\)/);
  assert.match(notification, /if \(status !== 403 && status !== 404\) return '';/);
  assert.match(notification, /return ` · \$\{method\} \$\{path\} \(\$\{status\}\)`;/);
  assert.match(notification, /requestDetail\(url, method, response\.status\)/);
});
