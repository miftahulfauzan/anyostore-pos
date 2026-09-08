const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
Object.assign(process.env, { DB_HOST: 'test', DB_USER: 'test', DB_PASSWORD: 'test', DB_NAME: 'test', JWT_SECRET: 'test', JWT_REFRESH_SECRET: 'test' });
const { createBackupRouter } = require('../src/routes/backup');

async function appFor(t, build) {
  const app = express();
  app.use('/backup', createBackupRouter({ create: build, authenticate: (req, res, next) => {
    if (!req.headers['x-role']) return res.status(401).json({ success: false });
    req.user = { role: req.headers['x-role'], branch_id: 1 }; next();
  }, authorize: role => (req, res, next) => req.user.role === role ? next() : res.status(403).json({ success: false }) }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}/backup`;
}

test('backup endpoints require owner and return private file / compatible JSON then cleanup', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-route-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'backup.json');
  const payload = '{"tables":{"a":[{"name":"Pakaian 👖 日本語"}]}}';
  await fs.writeFile(filePath, payload);
  let calls = 0, cleanups = 0;
  const base = await appFor(t, async () => { calls++; return { filePath, generatedAt: '2026-09-08T00:00:00.000Z', sizeBytes: Buffer.byteLength(payload),
    manifest: { tables: [{ name: 'a' }], total_rows: 1, media: [] }, cleanup: async () => { cleanups++; } }; });
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base + '/download', { headers: { 'x-role': 'kasir' } })).status, 403);
  assert.equal(calls, 0);
  const response = await fetch(base + '/download', { headers: { 'x-role': 'owner' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-backup-complete'), 'true');
  assert.match(response.headers.get('content-disposition'), /attachment; filename=/);
  assert.equal(await response.text(), payload);
  const legacy = await (await fetch(base, { headers: { 'x-role': 'owner' } })).json();
  assert.equal(legacy.data.download, payload);
  assert.equal(legacy.data.total_rows, 1);
  assert.deepEqual(legacy.data.truncated_tables, []);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cleanups, 2);
});

test('backup failure returns no attachment and no internal secrets', async (t) => {
  const base = await appFor(t, async () => { throw new Error('secret password SQL'); });
  const response = await fetch(base + '/download', { headers: { 'x-role': 'owner' } });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('content-disposition'), null);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.doesNotMatch(JSON.stringify(body), /password|SQL|secret/);
});
