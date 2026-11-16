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
const profilePage = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'app', 'profile', 'page.js'), 'utf8');
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
  assert.doesNotMatch(profilePage, /Semi/i);
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

test('laporan live memakai filter tanggal aturan yang sama dengan generate', () => {
  assert.match(
    commissions,
    /FROM commission_rules WHERE \(branch_id = \? OR branch_id IS NULL\) AND \(is_active=TRUE OR is_active=1\) AND start_date <= \? AND \(end_date IS NULL OR end_date >= \?\)/,
  );
});

test('arsip komisi bisa disaring per periode', () => {
  assert.match(commissions, /r\.period_start <= \? AND r\.period_end >= \?/);
  assert.match(commissions, /const start = isDate\(req\.query\.start\)/);
});

test('generate ulang memperbarui arsip pending dan melewati yang sudah disetujui', () => {
  assert.match(commissions, /if \(existing\[0\]\.status !== 'pending'\)/);
  assert.match(commissions, /UPDATE commission_records/);
  assert.match(commissions, /DELETE FROM commission_items WHERE record_id = \?/);
  assert.match(commissions, /data: \{ created, updated, skipped, branch_id: branchId \}/);
});

test('halaman komisi menerapkan tanggal otomatis tanpa tombol Tampilkan', () => {
  assert.doesNotMatch(webPage, />Tampilkan</);
  assert.match(webPage, /setTimeout\(/);
  assert.doesNotMatch(webPage, /Generate Komisi \(arsip\)/);
  assert.match(webPage, /loadMine\(/);
  assert.match(webPage, /loadReport\(selectedBranch, reportPeriod\.start, reportPeriod\.end\)/);
});

test('manager & admin melihat komisi pribadi di halaman komisi (bukan ditolak)', () => {
  assert.doesNotMatch(webPage, /Halaman komisi hanya dapat diakses oleh owner/);
  assert.doesNotMatch(webPage, /Halaman komisi hanya owner/);
  assert.match(webPage, /async function loadMine/);
  assert.match(webPage, /commissions\/mine/);
  // Endpoint khusus owner tidak boleh dipanggil oleh role lain.
  assert.match(webPage, /if \(!role \|\| role === 'owner'\) return undefined;/);
  assert.match(webPage, /if \(!role \|\| !\['owner', 'manager', 'admin'\]\.includes\(role\)\) return undefined;/);
  assert.match(webPage, /const canSeeTeamReport = isOwner \|\| role === 'manager' \|\| role === 'admin';/);
});

test('komisi pribadi memakai rincian tanpa semi dan tanpa tombol Tampilkan', () => {
  assert.doesNotMatch(profilePage, />Tampilkan</);
  assert.match(profilePage, /setTimeout\(/);
  assert.match(webPage, /Reg \$\{rupiah\(r\.commission_reguler_per_pcs\)\}\/pcs • Grosir/);
});

test('penjualan komisi tidak berlipat oleh jumlah baris item', () => {
  // Satu transaksi dengan 4 baris item sebelumnya terhitung 4x grand_total.
  const joinedQuery = commissions.match(/JOIN transaction_items ti ON ti\.transaction_id = t\.id[\s\S]*?GROUP BY tier/);
  assert.ok(joinedQuery, 'query qty per tier harus ada');
  assert.doesNotMatch(joinedQuery[0], /grand_total/, 'grand_total tidak boleh di-SUM di query yang join item');
  assert.match(commissions, /COALESCE\(SUM\(t\.grand_total - t\.cancelled_amount - t\.refunded_amount\),0\) AS sales,\s*\n\s*COUNT\(\*\) AS trx\s*\n\s*FROM transactions t/);
});

test('pcs & penjualan laporan mengikuti dasar aturan, bukan selalu transaksi sendiri', () => {
  // Manager dengan aturan scope=branch harus menampilkan total toko.
  assert.match(commissions, /let basis = own;/);
  assert.match(commissions, /if \(comm > basisCommission\)/);
  assert.match(commissions, /basis_scope: basisScope/);
  assert.match(commissions, /own_sales: own\.sales/);
  assert.match(commissions, /qty_reguler: basis\.qty_reguler/);
  assert.match(commissions, /total_sales: basis\.sales/);
  // /mine memakai basis yang sama.
  assert.match(commissions, /total_sales: basis\.sales,\s*\n\s*total_transactions: basis\.trx/);
  assert.match(commissions, /basis_scope: basisScope,\s*\n\s*own_sales: own\.sales/);
});

test('UI laporan menampilkan kolom dasar perhitungan', () => {
  assert.match(webPage, /<th>Dasar<\/th>/);
  assert.match(webPage, /SCOPE_LABEL\[r\.basis_scope\]/);
  assert.match(webPage, /Penjualan dasar/);
});
