const DEFAULT_MAX_EXECUTION_TIME_MS = 30000;
const MIN_MAX_EXECUTION_TIME_MS = 1000;
const MAX_MAX_EXECUTION_TIME_MS = 120000;

function withAuditExecutionLimit(sql, timeoutMs = DEFAULT_MAX_EXECUTION_TIME_MS) {
  const timeout = Number(timeoutMs);
  if (!Number.isSafeInteger(timeout) || timeout < MIN_MAX_EXECUTION_TIME_MS || timeout > MAX_MAX_EXECUTION_TIME_MS) {
    throw new RangeError(`Audit query timeout must be between ${MIN_MAX_EXECUTION_TIME_MS} and ${MAX_MAX_EXECUTION_TIME_MS} milliseconds`);
  }
  if (typeof sql !== 'string' || !/^\s*SELECT\b/i.test(sql)) {
    throw new TypeError('Audit execution limits can only be applied to SELECT statements');
  }

  return sql.replace(/^(\s*SELECT\b)/i, `$1 /*+ MAX_EXECUTION_TIME(${timeout}) */`);
}

async function executeAuditQuery(connection, label, sql, params = [], log = console.error) {
  const safeLabel = String(label || 'query').replace(/[\r\n]/g, ' ').slice(0, 100);
  const startedAt = Date.now();
  log(`[reset-audit] ${safeLabel} started`);

  try {
    const [rows] = await connection.execute(withAuditExecutionLimit(sql), params);
    log(`[reset-audit] ${safeLabel} complete (${Date.now() - startedAt}ms)`);
    return rows;
  } catch (error) {
    log(`[reset-audit] ${safeLabel} failed after ${Date.now() - startedAt}ms`);
    throw error;
  }
}

async function countAuditRows(connection, label, sql, params = [], log = console.error) {
  const rows = await executeAuditQuery(connection, `count ${label || 'query'}`, sql, params, log);
  return Number(rows[0]?.count || 0);
}

module.exports = { withAuditExecutionLimit, executeAuditQuery, countAuditRows };
