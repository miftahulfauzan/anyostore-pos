// Stateful SQL boundary. JWT, bcrypt and route middleware are not stubbed.
// Unknown SQL fails loudly, including new security checks without fixtures.
const assert = require('node:assert/strict');

function createAuthDb() {
  const state = { users: new Map(), tokens: [], queries: [], failure: null, nextId: 1 };
  let lock = Promise.resolve();
  async function execute(sql, params = []) {
    sql = sql.replace(/\s+/g, ' ').trim();
    state.queries.push({ sql, params });
    if (state.failure?.(sql)) throw new Error('Database unavailable');
    const rows = values => [structuredClone(values), []];
    if (sql.startsWith('SELECT') && sql.includes('FROM users WHERE')) {
      let users = [...state.users.values()];
      if (sql.includes('(email = ? OR username = ?)')) users = users.filter(u => u.email === params[0] || u.username === params[1]);
      else if (/username\s*=\s*\?/.test(sql)) users = users.filter(u => u.username === params[0] && u.id !== Number(params[1]));
      else users = users.filter(u => u.id === Number(params[0]));
      if (sql.includes('is_active = TRUE')) users = users.filter(u => u.is_active);
      return rows(users);
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM refresh_tokens') && !sql.includes('AS cnt')) {
      let tokens = state.tokens;
      let p = 0;
      for (const match of sql.matchAll(/\b(token_hash|user_id|session_id|id)\s*=\s*\?/g)) {
        const value = params[p++];
        tokens = tokens.filter(t => String(t[match[1]]) === String(value));
      }
      assert.equal(p, params.length, 'all session query parameters must be checked');
      if (sql.includes('revoked_at IS NULL')) tokens = tokens.filter(t => !t.revoked_at);
      if (sql.includes('expires_at > NOW()')) tokens = tokens.filter(t => t.expires_at > Date.now());
      return rows(tokens.slice(0, 1));
    }
    if (sql.startsWith('INSERT INTO refresh_tokens')) {
      const columns = sql.match(/\(([^)]+)\)/)[1].split(',').map(s => s.trim());
      assert.equal(columns.length, params.length);
      const token = Object.fromEntries(columns.map((c, i) => [c, params[i]]));
      assert.ok(state.users.has(Number(token.user_id)), 'refresh user foreign key');
      assert.ok(!state.tokens.some(t => t.token_hash === token.token_hash), 'refresh hash unique key');
      token.id = state.nextId++;
      token.expires_at *= 1000;
      token.revoked_at = null;
      token.session_id ??= null;
      state.tokens.push(token);
      return [{ insertId: token.id, affectedRows: 1 }, []];
    }
    if (sql.startsWith('DELETE FROM refresh_tokens')) {
      const before = state.tokens.length;
      state.tokens = state.tokens.filter(t => t.user_id !== params[0] || t.expires_at > Date.now());
      return [{ affectedRows: before - state.tokens.length }, []];
    }
    if (sql.startsWith('UPDATE refresh_tokens SET revoked_at = NOW()')) {
      const where = sql.split(' WHERE ')[1];
      let matched = state.tokens;
      let p = sql.includes('session_id = ?') && sql.indexOf('session_id = ?') < sql.indexOf(' WHERE ') ? 1 : 0;
      for (const match of where.matchAll(/\b(token_hash|user_id|session_id|id)\s*=\s*\?/g)) {
        const value = params[p++];
        matched = matched.filter(t => String(t[match[1]]) === String(value));
      }
      assert.equal(p, params.length);
      if (where.includes('revoked_at IS NULL')) matched = matched.filter(t => !t.revoked_at);
      matched.forEach(t => {
        t.revoked_at = Date.now();
        if (sql.includes('SET revoked_at = NOW(), session_id = ?')) t.session_id = params[0];
      });
      return [{ affectedRows: matched.length }, []];
    }
    if (sql.startsWith('UPDATE users SET')) {
      const [, set, where] = sql.match(/^UPDATE users SET (.+) WHERE (.+)$/);
      const assignments = set.split(/,(?![^()]*\))/).map(s => s.trim());
      const id = Number(params[(set.match(/\?/g) || []).length]);
      const user = state.users.get(id);
      if (!user) return [{ affectedRows: 0 }, []];
      if (where.includes('AND password = ?') && user.password !== params.at(-1)) return [{ affectedRows: 0 }, []];
      let p = 0;
      for (const assignment of assignments) {
        const [field, expression] = assignment.split(/\s*=\s*/);
        if (expression === '?') user[field] = params[p++];
        else if (expression === 'NOW()') user[field] = Date.now();
        else if (expression === 'NOT is_active') user[field] = !user.is_active;
        else if (expression === 'FALSE') user[field] = false;
        else if (expression === 'token_version + 1') user.token_version++;
        else if (expression === 'token_version + IF(role <> ?, 1, 0)') user.token_version += user.role !== params[p++] ? 1 : 0;
        else assert.fail(`Unhandled user assignment: ${assignment}`);
      }
      assert.equal(p + 1 + (where.includes('AND password = ?') ? 1 : 0), params.length);
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('SELECT') && sql.includes('AS cnt')) return rows([{ cnt: 1 }]);
    assert.fail(`Unexpected auth SQL: ${sql}`);
  }
  return {
    state, execute,
    async getConnection() {
      let unlock;
      let snapshot;
      return {
        execute,
        async beginTransaction() {
          const previous = lock;
          lock = new Promise(resolve => { unlock = resolve; });
          await previous;
          snapshot = structuredClone({ users: state.users, tokens: state.tokens, nextId: state.nextId });
        },
        async commit() { snapshot = null; unlock(); },
        async rollback() {
          if (snapshot) Object.assign(state, snapshot);
          snapshot = null;
          unlock?.();
        },
        release() { assert.equal(snapshot, null, 'connection released after transaction ends'); },
      };
    },
  };
}

module.exports = { createAuthDb };
