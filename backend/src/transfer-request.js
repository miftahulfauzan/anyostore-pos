const crypto = require('crypto');
const fail = (status, message) => Object.assign(new Error(message), { status });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stable(value[key]); return out;
  }, {});
  return value;
}
function requestHash(endpoint, request) {
  return crypto.createHash('sha256').update(JSON.stringify(stable({ endpoint, request }))).digest('hex');
}

async function beginTransferRequest(connection, userId, endpoint, request) {
  const requestId = request?.client_transfer_id;
  if (requestId == null || requestId === '') return { replay: null, requestId: null };
  if (typeof requestId !== 'string' || !UUID.test(requestId)) throw fail(400, 'client_transfer_id harus UUID v4 yang valid.');
  const hash = requestHash(endpoint, request);
  await connection.execute(
    'INSERT IGNORE INTO inventory_requests (user_id, request_id, request_hash, endpoint) VALUES (?, ?, ?, ?)',
    [userId, requestId, hash, endpoint],
  );
  const [rows] = await connection.execute(
    'SELECT request_hash, response_json FROM inventory_requests WHERE user_id=? AND request_id=? FOR UPDATE',
    [userId, requestId],
  );
  const row = rows[0];
  if (!row) throw fail(500, 'Permintaan transfer tidak dapat dicatat.');
  if (row.request_hash !== hash) throw fail(409, 'ID transfer sudah dipakai untuk data yang berbeda.');
  return { replay: row.response_json ? JSON.parse(row.response_json) : null, requestId };
}

async function finishTransferRequest(connection, userId, requestId, response) {
  if (!requestId) return;
  await connection.execute(
    'UPDATE inventory_requests SET response_json=? WHERE user_id=? AND request_id=?',
    [JSON.stringify(response), userId, requestId],
  );
}

module.exports = { beginTransferRequest, finishTransferRequest, requestHash };
