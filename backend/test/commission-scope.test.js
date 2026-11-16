const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regresi fitur "Dasar perhitungan" komisi + penghapusan tier semi grosir.
// Logika diuji pada tingkat sumber karena query-nya butuh MySQL.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const commissions = read('src/routes/commissions.js');
const webPage = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'app', 'commissions', 'page.js'), 'utf8');
const mobilePage = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'lib', 'src', 'commissions_page.dart'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261116_commission_scope.sql'), 'utf8');

test('skema menyediakan empat dasar perhitungan komisi', () => {
  assert.match(migration, /ADD COLUMN scope ENUM\('self','team','branch','company'\)/);
  assert.match(commissions, /const allowedScopes = new Set\(\['self', 'team', 'branch', 'company'\]\)/);
});

test('cakupan self/team/branch/company diterjemahkan ke filter SQL yang benar', () => {
  // self: hanya transaksi user; team: user lain; branch: semua staf cabang;
  // company: semua cabang (tanpa filter branch_id).
  assert.match(commissions, /if \(scope !== 'company'\) \{ where\.push\('t\.branch_id = \?'\); \}/);
  assert.match(commissions, /if \(scope === 'self'\) where\.push\('t\.user_id = \?'\);/);
  assert.match(commissions, /if \(scope === 'team'\) where\.push\('t\.user_id <> \?'\);/);
  assert.match(commissions, /if \(scope !== 'company'\) params\.push\(branchId\);/);
});

test('komisi dihitung dari agregat cakupan aturan, bukan selalu self', () => {
  assert.match(commissions, /const scope = ruleScope\(r\);/);
  assert.match(commissions, /const agg = await aggregate\(scope\);/);
  assert.match(commissions, /const scope = ruleScope\(rule\);\s*\n\s*const opts = \{ scope, branchId, userId: user\.id/);
});

test('semi grosir tidak lagi dipakai: pcs semi dihitung sebagai grosir', () => {
  assert.match(commissions, /CASE WHEN c\.price_tier = 'semi_grosir' THEN 'grosir_seri'/);
  assert.doesNotMatch(commissions, /commission_semi_grosir_per_pcs \|\| 0/);
  assert.doesNotMatch(webPage, /Semi grosir/i);
  assert.doesNotMatch(webPage, /qty_semi/);
  assert.doesNotMatch(mobilePage, /Semi Grosir/i);
});

test('aturan baru menyimpan scope dan menolak nilai tak dikenal', () => {
  assert.match(commissions, /scope: scopeInput = 'self'/);
  assert.match(commissions, /if \(!allowedScopes\.has\(String\(scopeInput\)\)\)/);
  assert.match(commissions, /calculation_type, percentage, flat_amount, scope, commission_reguler_per_pcs, commission_grosir_seri_per_pcs/);
});

test('gate minimal memakai agregat cakupan yang sama', () => {
  assert.match(commissions, /function qualifies\(rule, agg\) \{\s*\n\s*return agg\.sales >= Number\(rule\.min_target\) && agg\.trx >= Number\(rule\.min_transactions\);/);
});

test('owner dapat memilih cabang saat generate komisi', () => {
  assert.match(commissions, /const branchId = req\.user\.role === 'owner' && Number\.isInteger\(requestedBranch\) && requestedBranch > 0/);
});

test('UI web menyediakan pilihan dasar perhitungan', () => {
  for (const scope of ['self', 'team', 'branch', 'company']) {
    assert.match(webPage, new RegExp(`<option value="${scope}">`));
  }
  assert.match(webPage, /Dasar perhitungan/);
});