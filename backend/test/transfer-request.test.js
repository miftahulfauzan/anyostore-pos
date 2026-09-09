const test = require('node:test');
const assert = require('node:assert/strict');
const { beginTransferRequest, finishTransferRequest } = require('../src/transfer-request');
const id = '12345678-1234-4234-8234-123456789abc';
test('transfer request can be replayed without stock mutation, rejects changed payload', async () => {
  let row;
  const c = { execute: async (sql, params) => {
    if (sql.startsWith('INSERT')) { row ||= { request_hash: params[2], response_json: null }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT')) return [[row]];
    if (sql.startsWith('UPDATE')) { row.response_json = params[0]; return [{ affectedRows: 1 }]; }
    throw Error(sql);
  } };
  const request = { client_transfer_id: id, from_warehouse_id: 1, to_warehouse_id: 2, items: [{ product_id: 4, quantity: 1 }] };
  assert.equal((await beginTransferRequest(c, 5, '/transfers', request)).replay, null);
  await finishTransferRequest(c, 5, id, { id: 100, status: 'completed' });
  assert.deepEqual((await beginTransferRequest(c, 5, '/transfers', request)).replay, { id: 100, status: 'completed' });
  await assert.rejects(beginTransferRequest(c, 5, '/transfers', { ...request, to_warehouse_id: 3 }), { status: 409 });
});
test('invalid request UUID fails, while legacy clients remain supported', async () => {
  const c = { execute: async () => { throw Error('must not query'); } };
  await assert.rejects(beginTransferRequest(c, 5, '/transfers', { client_transfer_id: 'bad' }), { status: 400 });
  assert.equal((await beginTransferRequest(c, 5, '/transfers', {})).replay, null);
});
