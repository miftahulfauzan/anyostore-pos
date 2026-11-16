'use client';
import { localDateString } from '../lib/local-date';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import DateRangePresets from '../components/DateRangePresets';
import AnimatedValue from '../components/AnimatedValue';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const todayStr = () => localDateString();

const SCOPE_LABEL = {
  self: 'Sendiri',
  team: 'Staf lain',
  branch: 'Semua staf cabang',
  company: 'Semua cabang',
};

// Kartu ringkasan dipakai bersama oleh Komisi Saya (semua role) dan laporan owner.
const statCard = (label, value, { tone = false, money = false, suffix = '' } = {}) => (
  <div className="stat-tile" style={{
    display: 'grid',
    placeItems: 'center',
    gap: '.35rem',
    padding: '1rem',
    border: `1px solid ${tone ? '#bbf7d0' : 'var(--border)'}`,
    borderRadius: '.5rem',
    background: tone ? '#f0fdf4' : 'var(--card)',
    textAlign: 'center',
  }}>
    <span style={{ fontSize: 'var(--fs-xs)', color: tone ? '#15803d' : 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
    <strong style={{ fontSize: '1.1rem', color: tone ? '#16a34a' : undefined }}>
      <AnimatedValue value={value} money={money} suffix={suffix} />
    </strong>
  </div>
);

export default function CommissionsPage() {
  const [rules, setRules] = useState([]);
  const [report, setReport] = useState(null);
  const [mine, setMine] = useState(null);
  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({
    name: '',
    applies_to: 'role',
    role: 'manager',
    user_id: '',
    calculation_type: 'per_pcs_customer_tier',
    scope: 'self',
    percentage: '2',
    flat_amount: '',
    commission_reguler_per_pcs: '3000',
    commission_grosir_seri_per_pcs: '1000',
    min_target: '0',
    min_transactions: '0',
    start_date: '',
  });
  const [reportPeriod, setReportPeriod] = useState({ start: '', end: '' });
  const [reportPreset, setReportPreset] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [mineLoading, setMineLoading] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json'});

  async function load(branchId = selectedBranch) {
    try {
      const qs = branchId ? `?branch_id=${branchId}` : '';
      const [main, people, branchesRes] = await Promise.all([
        fetch(`${apiUrl}/commissions${qs}`, { headers: headers() }),
        fetch(`${apiUrl}/commissions/staff${branchId ? `?branch_id=${branchId}` : ''}`, { headers: headers() }),
        fetch(`${apiUrl}/settings/branches`, { headers: headers() }),
      ]);
      const mainBody = await main.json();
      const peopleBody = await people.json();
      const branchesBody = await branchesRes.json().catch(() => ({ data: [] }));
      if (!main.ok) throw new Error(mainBody.message);
      setRules(mainBody.data.rules);
      // prefer settings/branches for full list
      if (branchesBody.data?.length) setBranches(branchesBody.data);
      else if (mainBody.data.branches) setBranches(mainBody.data.branches);
      if (mainBody.data.branch_id && !selectedBranch) setSelectedBranch(String(mainBody.data.branch_id));
      setStaff(peopleBody.data || []);
    } catch (error) {
      setMessage(error.message || 'Komisi tidak dapat dimuat');
    }
  }

  async function loadReport(branchId = selectedBranch, start = reportPeriod.start, end = reportPeriod.end) {
    setReportLoading(true);
    try {
      const qs = new URLSearchParams({ start, end, ...(branchId ? { branch_id: branchId } : {}) }).toString();
      const r = await fetch(`${apiUrl}/commissions/report?${qs}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setReport(b.data);
      if (b.data.branches) setBranches(b.data.branches);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setReportLoading(false);
    }
  }

  // Komisi pribadi (semua role): jumlah yang tampil di halaman ini sama dengan
  // yang dilihat staf di Akun Saya dan aplikasi Android.
  async function loadMine(start = reportPeriod.start, end = reportPeriod.end) {
    if (!start || !end || start > end) return;
    setMineLoading(true);
    try {
      const qs = new URLSearchParams({ start, end }).toString();
      const r = await fetch(`${apiUrl}/commissions/mine?${qs}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMine(b.data);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setMineLoading(false);
    }
  }

  async function loadBranches() {
    try {
      const r = await fetch(`${apiUrl}/settings/branches`, { headers: headers() });
      const b = await r.json();
      if (r.ok) setBranches(b.data || []);
    } catch { /* malformed legacy configuration falls back to defaults */ }
  }

  useEffect(() => {
    setReportPeriod((p) => ({ start: p.start || todayStr(), end: p.end || todayStr() }));
  }, []);

  // Tanggal diganti → laporan & komisi pribadi dihitung ulang otomatis (tanpa tombol).
  useEffect(() => {
    if (!role || !['owner', 'manager', 'admin'].includes(role)) return undefined;
    if (!reportPeriod.start || !reportPeriod.end || reportPeriod.start > reportPeriod.end) return undefined;
    const timer = setTimeout(() => {
      loadReport(selectedBranch, reportPeriod.start, reportPeriod.end);
    }, 350);
    return () => clearTimeout(timer);
  }, [role, reportPeriod.start, reportPeriod.end, selectedBranch]);

  useEffect(() => {
    if (!role || role === 'owner') return undefined;
    if (!reportPeriod.start || !reportPeriod.end || reportPeriod.start > reportPeriod.end) return undefined;
    const timer = setTimeout(() => {
      loadMine(reportPeriod.start, reportPeriod.end);
    }, 350);
    return () => clearTimeout(timer);
  }, [role, reportPeriod.start, reportPeriod.end]);

  useEffect(() => {
    /* sesi via httpOnly cookie */
    loadBranches();
    fetch(`${apiUrl}/auth/me`, { headers: headers() })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const userRole = body?.data?.role;
        setRole(userRole);
        if (userRole === 'owner') load();
      })
      .catch(() => setMessage('Gagal memuat profil pengguna.'));
  }, []);

  async function createRule(event) {
    event.preventDefault();
    setMessage('');
    try {
      const payload = {
        ...form,
        branch_id: selectedBranch ? Number(selectedBranch) : null,
        percentage: Number(form.percentage || 0),
        flat_amount: Number(form.flat_amount || 0),
        commission_reguler_per_pcs: Number(form.commission_reguler_per_pcs || 0),
        commission_grosir_seri_per_pcs: Number(form.commission_grosir_seri_per_pcs || 0),
        min_target: Number(form.min_target || 0),
        min_transactions: Number(form.min_transactions || 0),
        user_id: form.user_id ? Number(form.user_id) : null,
      };
      const response = await fetch(`${apiUrl}/commissions/rules`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage('Aturan komisi disimpan.');
      setForm({ ...form, name: '' });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteRule(id, name) {
    if (!confirm(`Hapus aturan "${name}"? Semua record terkait juga akan terhapus.`)) return;
    try {
      const r = await fetch(`${apiUrl}/commissions/rules/${id}`, { method: 'DELETE', headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(`Aturan "${name}" dihapus.`);
      load();
      loadReport();
    } catch (e) {
      setMessage(e.message);
    }
  }

  if (!role) {
    return (
      <AppShell title="Komisi Staf" eyebrow="INSENTIF & TARGET">
        <section className="panel"><p className="muted">Memuat data komisi…</p></section>
      </AppShell>
    );
  }

  const isOwner = role === 'owner';
  const canSeeTeamReport = isOwner || role === 'manager' || role === 'admin';
  const isPerPcs = form.calculation_type === 'per_pcs_customer_tier';
  const mineLive = mine?.live;
  const mineRules = mine?.applicable_rules || [];
  const minePcsTotal = Number(mineLive?.qty_reguler || 0) + Number(mineLive?.qty_grosir_seri || 0);
  const topRuleId = mineLive?.rules?.length
    ? mineLive.rules.reduce((best, rule) => (Number(rule.commission) > Number(best.commission) ? rule : best), mineLive.rules[0]).rule_id
    : null;

  // Kontrol periode dipakai bersama Laporan & Komisi Saya (satu rentang tanggal).
  const periodControls = (
    <>
      <div style={{ width: '100%' }}>
        <DateRangePresets active={reportPreset} onPick={(key, range) => {
          setReportPreset(key);
          if (range) setReportPeriod(range);
        }} />
      </div>
      {isOwner && (
        <label>Toko
          <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); load(e.target.value); }}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} (ID {b.id})</option>)}
          </select>
        </label>
      )}
      <label style={{ minWidth: 150 }}>Dari<input type="date" value={reportPeriod.start} onChange={(e) => { setReportPreset('custom'); setReportPeriod({ ...reportPeriod, start: e.target.value }); }} /></label>
      <label style={{ minWidth: 150 }}>Sampai<input type="date" value={reportPeriod.end} onChange={(e) => { setReportPreset('custom'); setReportPeriod({ ...reportPeriod, end: e.target.value }); }} /></label>
      <span className="muted" style={{ fontSize: 'var(--fs-sm)', alignSelf: 'center' }}>
        {(reportLoading || mineLoading) ? 'Menghitung…' : `${reportPeriod.start} → ${reportPeriod.end}`}
      </span>
    </>
  );

  return (
    <AppShell title="Komisi Staf" eyebrow="INSENTIF & TARGET">
      <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 1280, margin: '0 auto' }}>
        {message && <p className="message" role="status">{message}</p>}

        {/* KOMISI PRIBADI — semua role selain owner */}
        {!isOwner && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Komisi Saya</h2>
                <p>Dihitung langsung dari transaksi sesuai aturan yang berlaku untuk peran Anda.</p>
              </div>
              <span className="tag">{mine ? rupiah(mineLive?.estimated) : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '.75rem' }}>
              {periodControls}
            </div>
            {!mine && <p className="muted">Memuat komisi…</p>}
            {mine && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.75rem', marginTop: '1rem' }}>
                  {statCard('Penjualan dasar', mineLive?.total_sales, { money: true })}
                  {statCard('Transaksi dasar', mineLive?.total_transactions || 0)}
                  {statCard('Estimasi Komisi', mineLive?.estimated, { money: true, tone: true })}
                  {statCard('Reguler pcs dasar', mineLive?.qty_reguler || 0)}
                  {statCard('Grosir pcs dasar', mineLive?.qty_grosir_seri || 0)}
                </div>
                <div className="m-compose" aria-label="Komposisi pcs">
                  <div className="m-compose-head">
                    <span>Reguler</span>
                    <strong>{Number(mineLive?.qty_reguler || 0)} pcs{minePcsTotal ? ` (${Math.round((Number(mineLive?.qty_reguler || 0) / minePcsTotal) * 100)}%)` : ''}</strong>
                  </div>
                  <div className="m-compose-track">
                    <div className="m-compose-fill" style={{ '--m-compose-width': `${minePcsTotal ? (Number(mineLive?.qty_reguler || 0) / minePcsTotal) * 100 : 0}%`, '--m-compose-index': 0 }} />
                  </div>
                  <div className="m-compose-head">
                    <span>Grosir</span>
                    <strong>{Number(mineLive?.qty_grosir_seri || 0)} pcs{minePcsTotal ? ` (${Math.round((Number(mineLive?.qty_grosir_seri || 0) / minePcsTotal) * 100)}%)` : ''}</strong>
                  </div>
                  <div className="m-compose-track">
                    <div className="m-compose-fill" style={{ '--m-compose-width': `${minePcsTotal ? (Number(mineLive?.qty_grosir_seri || 0) / minePcsTotal) * 100 : 0}%`, '--m-compose-index': 1, background: 'linear-gradient(90deg, #c2410c, #ea8a52)' }} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 'var(--fs-sm)', margin: '.5rem 0 0' }}>
                  Angka di atas adalah dasar perhitungan aturan terbesar Anda: <strong>{SCOPE_LABEL[mineLive?.basis_scope] || 'Sendiri'}</strong>
                  {mineLive?.basis_scope && mineLive.basis_scope !== 'self'
                    ? ` (transaksi Anda sendiri: ${rupiah(mineLive?.own_sales)} • ${mineLive?.own_qty_reguler || 0} + ${mineLive?.own_qty_grosir_seri || 0} pcs)`
                    : ''}
                </p>
                {mineLive?.rules?.length ? (
                  <div className="table-wrap" style={{ marginTop: '1rem' }}>
                    <table>
                      <thead><tr><th>Aturan</th><th>Dasar</th><th>Tipe</th><th>Rincian</th><th>Komisi</th></tr></thead>
                      <tbody>
                        {mineLive.rules.map((r) => (
                          <tr key={r.rule_id} className={r.rule_id === topRuleId ? 'is-top-rule' : ''}>
                            <td><strong>{r.name}</strong></td>
                            <td>{SCOPE_LABEL[r.scope] || 'Sendiri'}</td>
                            <td><span className="tag" style={{ fontSize: 'var(--fs-xs)' }}>{r.type}</span></td>
                            <td style={{ fontSize: 'var(--fs-sm)' }}>
                              {r.type === 'per_pcs_customer_tier'
                                ? `Reg ${rupiah(r.commission_reguler_per_pcs)}/pcs • Grosir ${rupiah(r.commission_grosir_seri_per_pcs)}/pcs (Reg ${r.qty_breakdown?.reguler || 0} • Grosir ${r.qty_breakdown?.grosir_seri || 0} pcs)`
                                : r.type?.includes('percentage') ? `${r.percentage}%` : rupiah(r.flat_amount)}
                            </td>
                            <td><strong>{rupiah(r.commission)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="panel" style={{ background: '#fff7ed', borderColor: '#fed7aa', marginTop: '1rem' }}>
                    <p style={{ margin: 0 }}>
                      {mineRules.length === 0
                        ? <>Belum ada aturan komisi untuk peran <strong>{role}</strong>. Owner membuatnya di halaman ini (masuk sebagai owner) → Berlaku untuk = Semua / role {role}.</>
                        : <>Belum ada penjualan yang dihitung pada rentang ini, atau transaksi belum memenuhi target minimal aturan.</>}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* LAPORAN PER AKUN — owner, manager, admin */}
        {canSeeTeamReport && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Laporan Komisi per Akun{isOwner ? ' (Owner)' : ''}</h2>
                <p>{isOwner ? 'Live per pcs by customer tier. Pilih toko untuk lihat cabang Metro, Toko B, dll.' : 'Ringkasan komisi seluruh staf di cabang Anda pada rentang tanggal ini.'}</p>
              </div>
              <span className="tag">{report ? rupiah(report.total_commission) : ''}</span>
            </div>
            {isOwner && (
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '.75rem' }}>
                {periodControls}
              </div>
            )}
            {!isOwner && (
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: '.5rem' }}>
                Periode mengikuti pilihan di atas{report?.branch_id ? ` • Cabang ${report.branch_id}` : ''}.
              </p>
            )}
            {report ? (
              <div className="table-wrap" style={{ marginTop: isOwner ? '1rem' : '.25rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Akun</th><th>Role</th><th>Dasar</th><th>Reguler pcs</th><th>Grosir pcs</th><th>Total pcs</th><th>Penjualan</th><th>Komisi</th><th>Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.per_account.length ? report.per_account.map((r) => (
                      <tr key={r.user_id}>
                        <td><strong>{r.name}</strong></td>
                        <td>{r.role}</td>
                        <td>{SCOPE_LABEL[r.basis_scope] || 'Sendiri'}</td>
                        <td>{r.qty_reguler}</td>
                        <td>{r.qty_grosir}</td>
                        <td>{r.total_qty}</td>
                        <td>
                          {rupiah(r.total_sales)}
                          {r.basis_scope && r.basis_scope !== 'self' && (
                            <><br /><small className="muted">sendiri: {rupiah(r.own_sales)}</small></>
                          )}
                        </td>
                        <td><strong>{rupiah(r.commission)}</strong></td>
                        <td style={{ fontSize: 'var(--fs-sm)' }}>{r.breakdown.map((b) => `${b.name} (${SCOPE_LABEL[b.scope] || 'Sendiri'}): ${rupiah(b.commission)}`).join(' • ')}</td>
                      </tr>
                    )) : <tr><td colSpan={9}>Tidak ada komisi di periode ini.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={7} style={{ textAlign: 'right' }}><strong>Total Komisi Semua Akun</strong></td><td colSpan={2}><strong>{rupiah(report.total_commission)}</strong></td></tr>
                  </tfoot>
                </table>
              </div>
            ) : <p className="muted">Memuat laporan…</p>}
            {report && (
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', margin: '.5rem 0 0' }}>
                Pcs & penjualan mengikuti <strong>Dasar</strong> tiap akun. Manager dengan dasar “Semua staf cabang” berarti total seluruh produk terjual di toko, bukan hanya transaksi manager itu sendiri.
              </p>
            )}
          </section>
        )}

        {isOwner && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem', alignItems: 'start' }}>
            <section className="panel">
              <h2>Aturan Komisi Baru</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-md)' }}>Untuk manager: pakai tipe <strong>Per pcs by customer tier</strong>, isi tarif reguler dan grosir per pcs.</p>
              <form onSubmit={createRule} style={{ display: 'grid', gap: '.75rem', marginTop: '.75rem' }}>
                <label>Toko
                  <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); load(e.target.value); }}>
                    <option value="">Global (semua toko)</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name} (ID {b.id})</option>)}
                  </select>
                </label>
                <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>Pilih toko untuk aturan khusus cabang (misal manager Toko B). Kosongkan untuk aturan global.</p>
                <label>Nama aturan*<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Komisi manager per pcs" required /></label>
                <div className="two-fields">
                  <label>Berlaku untuk
                    <select value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
                      <option value="all">Semua staf</option>
                      <option value="role">Peran tertentu</option>
                      <option value="user">Staf tertentu</option>
                    </select>
                  </label>
                  {form.applies_to === 'user' ? (
                    <label>Staf
                      <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
                        <option value="">Pilih staf</option>
                        {staff.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>Peran
                      <select value={form.role} disabled={form.applies_to === 'all'} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                        <option value="kasir">Kasir</option>
                        <option value="admin">Admin</option>
                        <option value="manager">Manajer</option>
                        <option value="gudang">Admin Gudang</option>
                      </select>
                    </label>
                  )}
                </div>
                <label>Dasar perhitungan
                  <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                    <option value="self">Transaksi sendiri (kinerja pribadi)</option>
                    <option value="team">Staf lain di cabang (tanpa dirinya)</option>
                    <option value="branch">Semua staf di cabang (termasuk dirinya)</option>
                    <option value="company">Semua cabang</option>
                  </select>
                </label>
                <label>Cara hitung
                  <select value={form.calculation_type} onChange={(e) => setForm({ ...form, calculation_type: e.target.value })}>
                    <option value="per_pcs_customer_tier">Per pcs by customer tier (baru)</option>
                    <option value="percentage_sales">Persentase penjualan</option>
                    <option value="percentage_profit">Persentase laba</option>
                    <option value="per_transaction">Nominal per transaksi</option>
                    <option value="flat_monthly">Nominal per periode</option>
                  </select>
                </label>
                {isPerPcs ? (
                  <div className="two-fields">
                    <label>Reguler /pcs<input type="number" min="0" value={form.commission_reguler_per_pcs} onChange={(e) => setForm({ ...form, commission_reguler_per_pcs: e.target.value })} placeholder="3000" /></label>
                    <label>Grosir /pcs<input type="number" min="0" value={form.commission_grosir_seri_per_pcs} onChange={(e) => setForm({ ...form, commission_grosir_seri_per_pcs: e.target.value })} placeholder="1000" /></label>
                  </div>
                ) : form.calculation_type.startsWith('percentage') ? (
                  <label>Persentase (%)<input type="number" min="0" step="0.01" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} /></label>
                ) : (
                  <label>Nominal (Rp)<input type="number" min="0" value={form.flat_amount} onChange={(e) => setForm({ ...form, flat_amount: e.target.value })} /></label>
                )}
                <div className="two-fields">
                  <label>Min target penjualan<input type="number" min="0" value={form.min_target} onChange={(e) => setForm({ ...form, min_target: e.target.value })} /></label>
                  <label>Min transaksi<input type="number" min="0" value={form.min_transactions} onChange={(e) => setForm({ ...form, min_transactions: e.target.value })} /></label>
                </div>
                <label>Mulai berlaku<input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></label>
                <button type="submit">Simpan Aturan</button>
              </form>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div><h2>Daftar Aturan</h2><p>Owner bisa hapus.</p></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nama</th><th>Berlaku</th><th>Dasar</th><th>Cara</th><th>Nilai</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong><br /><small className="muted">{r.staff_name || r.role || 'semua'}</small></td>
                        <td>{r.applies_to}{r.role ? `:${r.role}` : ''}</td>
                        <td>{SCOPE_LABEL[r.scope] || 'Sendiri'}</td>
                        <td>{r.calculation_type}</td>
                        <td style={{ fontSize: 'var(--fs-sm)' }}>
                          {r.calculation_type === 'per_pcs_customer_tier'
                            ? `Reg ${rupiah(r.commission_reguler_per_pcs)}/pcs • Grosir ${rupiah(r.commission_grosir_seri_per_pcs)}/pcs`
                            : r.calculation_type.startsWith('percentage') ? `${r.percentage}%` : rupiah(r.flat_amount)
                          }
                        </td>
                        <td><button type="button" className="small danger" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }} onClick={() => deleteRule(r.id, r.name)}>Hapus</button></td>
                      </tr>
                    ))}
                    {!rules.length && <tr><td colSpan={6}>Belum ada aturan.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

      </div>
    </AppShell>
  );
}
