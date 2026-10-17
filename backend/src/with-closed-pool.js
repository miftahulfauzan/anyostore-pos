async function withClosedPool(pool, operation) {
  try {
    return await operation();
  } finally {
    await pool.end();
  }
}

module.exports = { withClosedPool };
