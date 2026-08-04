'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import DateRangePresets from '../components/DateRangePresets';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonthStr = () => `${todayStr().slice(0, 8)}01`;

export default function CommissionsPage() {
  const [rules, setRules] = useState([]);
  const [records, setRecords] = useState([]);
  const [report, setReport] = useState(null);
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
    percentage: '2',
    flat_amount: '',
    commission_reguler_per_pcs: '3000',
    commission_semi_grosir_per_pcs: '3000',
    commission_grosir_seri_per_pcs: '1000',
    min_target: '0',
    min_transactions: '0',
    start_date: '',
  });
  const [period, setPeriod] = useState({ period_start: '', period_end: '' });
  const [reportPeriod, setReportPeriod] = useState({ start: '', end: '' });
  const [reportPreset, setReportPreset] = useState('');

  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

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
      setRecords(mainBody.data.records);
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
    try {
      const qs = new URLSearchParams({ start, end, ...(branchId ? { branch_id: branchId } : {}) }).toString();
      const r = await fetch(`${apiUrl}/commissions/report?${qs}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setReport(b.data);
      if (b.data.branches) setBranches(b.data.branches);
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function loadBranches() {
    try {
      const r = await fetch(`${apiUrl}/settings/branches`, { headers: headers() });
      const b = await r.json();
      if (r.ok) setBranches(b.data || []);
    } catch {}
  }

  useEffect(() => {
    setPeriod((p) => ({ period_start: p.period_start || firstOfMonthStr(), period_end: p.period_end || todayStr() }));
    setReportPeriod((p) => ({ start: p.start || firstOfMonthStr(), end: p.end || todayStr() }));
  }, []);
  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    loadBranches();
    fetch(`${apiUrl}/auth/me`, { headers: headers() })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const userRole = body?.data?.role;
        setRole(userRole);
        if (userRole === 'owner') {
          load();
          loadReport();
        } else setMessage('Halaman komisi hanya dapat diakses oleh owner.');
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
        commission_semi_grosir_per_pcs: Number(form.commission_semi_grosir_per_pcs || 0),
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

  async function generate(event) {
    event.preventDefault();
    try {
      const response = await fetch(`${apiUrl}/commissions/generate`, { method: 'POST', headers: headers(), body: JSON.stringify(period) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage(`${body.data.created} catatan komisi dibuat.`);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateStatus(id, status) {
    try {
      const response = await fetch(`${apiUrl}/commissions/records/${id}/status`, { method: 'PUT', headers: headers(), body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage(status === 'paid' ? 'Komisi ditandai sudah dibayar.' : 'Komisi disetujui.');
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

  if (role && role !== 'owner') {
    return (
      <AppShell title="Komisi Staf" eyebrow="INSENTIF & TARGET">
        <section className="panel"><h2>Akses dibatasi</h2><p className="muted">Halaman komisi hanya owner. Lihat komisi Anda di Akun Saya.</p></section>
      </AppShell>
    );
  }

  const isPerPcs = form.calculation_type === 'per_pcs_customer_tier';

  return (
    <AppShell title="Komisi Staf" eyebrow="INSENTIF & TARGET">
      <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 1280, margin: '0 auto' }}>
        {message && <p className="message" role="status">{message}</p>}

        {/* OWNER REPORT PER ACCOUNT */}
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Laporan Komisi per Akun (Owner)</h2>
              <p>Live per pcs by customer tier. Pilih toko untuk lihat cabang Metro, Toko B, dll.</p>
            </div>
            <span className="tag">{report ? rupiah(report.total_commission) : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '.75rem' }}>
            <div style={{ width: '100%' }}>
              <DateRangePresets active={reportPreset} onPick={(key, range) => {
                setReportPreset(key);
                if (range) {
                  setReportPeriod(range);
                  loadReport(selectedBranch, range.start, range.end);
                }
              }} />
            </div>
            <label>Toko
              <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); load(e.target.value); loadReport(e.target.value); }}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} (ID {b.id})</option>)}
              </select>
            </label>
            <label style={{ minWidth: 150 }}>Dari<input type="date" value={reportPeriod.start} onChange={(e) => setReportPeriod({ ...reportPeriod, start: e.target.value })} /></label>
            <label style={{ minWidth: 150 }}>Sampai<input type="date" value={reportPeriod.end} onChange={(e) => setReportPeriod({ ...reportPeriod, end: e.target.value })} /></label>
            <button type="button" onClick={() => loadReport()} style={{ minHeight: 40 }}>Tampilkan</button>
            <span className="muted" style={{ fontSize: '.85rem', alignSelf: 'center' }}>{report?.period_start} → {report?.period_end} {report?.branch_id ? `• Cabang ${report.branch_id}` : ''}</span>
          </div>
          {report ? (
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Akun</th><th>Role</th><th>Reguler pcs</th><th>Semi pcs</th><th>Grosir pcs</th><th>Total pcs</th><th>Penjualan</th><th>Komisi</th><th>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {report.per_account.length ? report.per_account.map((r) => (
                    <tr key={r.user_id}>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.role}</td>
                      <td>{r.qty_reguler}</td>
                      <td>{r.qty_semi}</td>
                      <td>{r.qty_grosir}</td>
                      <td>{r.total_qty}</td>
                      <td>{rupiah(r.total_sales)}</td>
                      <td><strong>{rupiah(r.commission)}</strong></td>
                      <td style={{ fontSize: '.8rem' }}>{r.breakdown.map((b) => `${b.name}: ${rupiah(b.commission)}`).join(' • ')}</td>
                    </tr>
                  )) : <tr><td colSpan={9}>Tidak ada komisi di periode ini.</td></tr>}
                </tbody>
                <tfoot>
                  <tr><td colSpan={7} style={{ textAlign: 'right' }}><strong>Total Komisi Semua Akun</strong></td><td colSpan={2}><strong>{rupiah(report.total_commission)}</strong></td></tr>
                </tfoot>
              </table>
            </div>
          ) : <p className="muted">Memuat laporan…</p>}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem', alignItems: 'start' }}>
          <section className="panel">
            <h2>Aturan Komisi Baru</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: '.9rem' }}>Untuk manager: pakai tipe <strong>Per pcs by customer tier</strong> — isi 3000/3000/1000 per pcs.</p>
            <form onSubmit={createRule} style={{ display: 'grid', gap: '.75rem', marginTop: '.75rem' }}>
              <label>Toko
                <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); load(e.target.value); loadReport(e.target.value); }}>
                  <option value="">Global (semua toko)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name} (ID {b.id})</option>)}
                </select>
              </label>
              <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>Pilih toko untuk aturan khusus cabang (misal manager Toko B). Kosongkan untuk aturan global.</p>
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
                      {staff.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                  <label>Reguler /pcs<input type="number" min="0" value={form.commission_reguler_per_pcs} onChange={(e) => setForm({ ...form, commission_reguler_per_pcs: e.target.value })} placeholder="3000" /></label>
                  <label>Semi grosir /pcs<input type="number" min="0" value={form.commission_semi_grosir_per_pcs} onChange={(e) => setForm({ ...form, commission_semi_grosir_per_pcs: e.target.value })} placeholder="3000" /></label>
                  <label>Grosir seri /pcs<input type="number" min="0" value={form.commission_grosir_seri_per_pcs} onChange={(e) => setForm({ ...form, commission_grosir_seri_per_pcs: e.target.value })} placeholder="1000" /></label>
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
                <thead><tr><th>Nama</th><th>Berlaku</th><th>Cara</th><th>Nilai</th><th>Aksi</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong><br /><small className="muted">{r.staff_name || r.role || 'semua'}</small></td>
                      <td>{r.applies_to}{r.role ? `:${r.role}` : ''}</td>
                      <td>{r.calculation_type}</td>
                      <td style={{ fontSize: '.85rem' }}>
                        {r.calculation_type === 'per_pcs_customer_tier'
                          ? `Reg ${rupiah(r.commission_reguler_per_pcs)}/pcs • Semi ${rupiah(r.commission_semi_grosir_per_pcs)} • Grosir ${rupiah(r.commission_grosir_seri_per_pcs)}`
                          : r.calculation_type.startsWith('percentage') ? `${r.percentage}%` : rupiah(r.flat_amount)
                        }
                      </td>
                      <td><button className="small danger" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }} onClick={() => deleteRule(r.id, r.name)}>Hapus</button></td>
                    </tr>
                  ))}
                  {!rules.length && <tr><td colSpan={5}>Belum ada aturan.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="panel">
          <h2>Generate Komisi (arsip)</h2>
          <p className="muted">Opsional — untuk history pembayarannya. Komisi live di Akun Saya & Laporan sudah otomatis tanpa generate.</p>
          <form onSubmit={generate} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '.5rem' }}>
            <label>Dari<input type="date" value={period.period_start} onChange={(e) => setPeriod({ ...period, period_start: e.target.value })} /></label>
            <label>Sampai<input type="date" value={period.period_end} onChange={(e) => setPeriod({ ...period, period_end: e.target.value })} /></label>
            <button type="submit">Generate</button>
          </form>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead><tr><th>Staf</th><th>Periode</th><th>Sales</th><th>Trx</th><th>Reg</th><th>Semi</th><th>Grosir</th><th>Komisi</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    <td>{rec.staff_name}</td>
                    <td>{rec.period_start} — {rec.period_end}</td>
                    <td>{rupiah(rec.total_sales)}</td>
                    <td>{rec.total_transactions}</td>
                    <td>{rec.qty_reguler || 0}</td>
                    <td>{rec.qty_semi_grosir || 0}</td>
                    <td>{rec.qty_grosir_seri || 0}</td>
                    <td>{rupiah(rec.commission_amount)}</td>
                    <td><span className={'status ' + rec.status}>{rec.status}</span></td>
                    <td style={{ display: 'flex', gap: '.25rem' }}>
                      <button className="small secondary" onClick={() => updateStatus(rec.id, 'approved')}>Setujui</button>
                      <button className="small" onClick={() => updateStatus(rec.id, 'paid')}>Bayar</button>
                    </td>
                  </tr>
                ))}
                {!records.length && <tr><td colSpan={10}>Belum ada record.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
