const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitStatements, executeStatements } = require('../scripts/migrate');

test('SQL splitter preserves semicolons in quoted values and comments', () => {
  const sql = "INSERT INTO t VALUES ('a;b'); -- a; comment\nALTER TABLE t ADD COLUMN x INT;";
  assert.equal(splitStatements(sql).length, 2);
});

test('duplicate in first statement does not skip later statements', async () => {
  const calls = [];
  const connection = { async query(sql) {
    calls.push(sql);
    if (calls.length === 1) throw Object.assign(new Error('Duplicate column name'), { code: 'ER_DUP_FIELDNAME' });
  } };
  const idempotent = await executeStatements(connection, 'ALTER TABLE t ADD COLUMN a INT; ALTER TABLE t ADD COLUMN b INT;');
  assert.equal(idempotent, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /ADD COLUMN b/);
});

test('real error after duplicate prevents migration completion', async () => {
  let count = 0;
  const connection = { async query() {
    count += 1;
    throw new Error(count === 1 ? 'Duplicate column name' : 'Syntax error');
  } };
  await assert.rejects(executeStatements(connection, 'ALTER TABLE t ADD a INT; ALTER TABLE t ADD b INT;'), /Syntax error/);
});

test('all existing migration files can be split into statements', () => {
  const dir = path.join(__dirname, '../migrations');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
    const statements = splitStatements(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.ok(statements.length > 0, file);
  }
});
