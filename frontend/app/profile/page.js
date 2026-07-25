'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;

export default function MyAccount() {
  const [profile, setProfile] = useState(null);
  const [commission, setCommission] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_access_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) { window.location.assign('/'); return; }
    async function safeJson(r) {
      try { return await r.json(); } catch { return { success: false, message: `HTTP ${r.status}` }; }
    }
    fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const b = await safeJson(r);
        if (!r.ok) throw new Error(b.message || `Gagal ambil profil (${r.status})`);
        setProfile(b.data);
        setName(b.data?.name || '');
        setEmail(b.data?.email || '');
      })
      .catch((e) => setMessage(e.message || String(e)));
    fetch(`${api}/commissions/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const b = await safeJson(r);
        if (!r.ok) {
          if (r.status === 429) { setCommission({ summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [], live: null }); return; }
          setCommission({ summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [], live: null, applicable_rules: [] });
          return;
        }
        setCommission(b.data || { summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [], live: null });
      })
      .catch(() => setCommission({ summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [], live: null, applicable_rules: [] }));
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return setMessage('Nama dan email wajib diisi');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessage('Format email tidak valid');
    setSavingProfile(true);
    try {
      const r = await fetch(`${api}/users/profile`, { method: 'PUT', headers: headers(), body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.message || `Gagal simpan profil (${r.status})`);
      setProfile((p) => ({ ...p, name: name.trim(), email: email.trim().toLowerCase() }));
      setMessage('Profil berhasil diperbarui.');
    } catch (e2) { setMessage(e2.message); }
    finally { setSavingProfile(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (!current || !newPass) return setMessage('Password lama dan baru wajib diisi');
    if (newPass.length < 8) return setMessage('Password baru minimal 8 karakter');
    if (newPass !== confirm) return setMessage('Konfirmasi password tidak cocok');
    setLoading(true);
    try {
      const r = await fetch(`${api}/users/profile/password`, { method: 'PUT', headers: headers(), body: JSON.stringify({ current_password: current, new_password: newPass }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Password berhasil diubah.');
      setCurrent(''); setNewPass(''); setConfirm('');
    } catch (e) { setMessage(e.message); } finally { setLoading(false); }
  }

  const live = commission?.live;
  const rules = commission?.applicable_rules || [];

  return (
    <AppShell title="Akun Saya" eyebrow="PROFIL">
      {message && <p className="message" role="status">{message}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start', maxWidth: 1180, margin: '0 auto' }}>
        <section className="panel">
          <h2>Profil</h2>
          {profile ? (
            <>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span className="tag">{profile.role}</span>
                <span className="muted" style={{ fontSize: '.85rem' }}>{profile.branch_name || `#${profile.branch_id}`}</span>
              </div>
              <form onSubmit={saveProfile} style={{ display: 'grid', gap: '.75rem' }}>
                <label>Nama<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
                <label>Email login<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
                <button type="submit" disabled={savingProfile}>{savingProfile ? 'Menyimpan…' : 'Simpan Profil'}</button>
              </form>
            </>
          ) : <p>Memuat profil…</p>}
        </section>

        <section className="panel">
          <h2>Ubah Password</h2>
          <form onSubmit={changePassword} style={{ display: 'grid', gap: '.75rem' }}>
            <label>Password lama<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
            <label>Password baru<input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} /></label>
            <label>Konfirmasi<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
            <button type="submit" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan Password'}</button>
          </form>
        </section>

        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="section-heading">
            <div><h2>Komisi Saya</h2><p>Terhitung dari aturan aktif — live bulan ini + riwayat generate.</p></div>
          </div>

          {!commission && <p>Memuat komisi…</p>}

          {commission && (
            <>
              {live && (
                <div className="panel" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
                    <strong>Bulan ini ({live.period_start} → {live.period_end})</strong>
                    <span className="tag">Live hitung</span>
                  </div>
                  <div className="metrics-grid" style={{ marginTop: '.75rem', marginBottom: 0 }}>
                    <article className="metric-card"><span>Penjualan</span><strong>{rp(live.total_sales)}</strong></article>
                    <article className="metric-card"><span>Transaksi</span><strong>{live.total_transactions}</strong></article>
                    <article className="metric-card"><span>Estimasi komisi</span><strong style={{ color: '#16a34a' }}>{rp(live.estimated)}</strong></article>
                    <article className="metric-card"><span>Aturan berlaku</span><strong>{live.rules?.length || 0}</strong></article>
                  </div>
                  {live.rules?.length ? (
                    <div className="table-wrap" style={{ marginTop: '.75rem' }}>
                      <table><thead><tr><th>Aturan</th><th>Tipe</th><th>Komisi</th></tr></thead>
                      <tbody>{live.rules.map((r) => <tr key={r.rule_id}><td>{r.name}</td><td>{r.type}</td><td>{rp(r.commission)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted" style={{ marginTop: '.5rem' }}>Belum ada aturan yang cocok — hubungi owner untuk setting komisi role <code>{profile?.role}</code>.</p>
                  )}
                </div>
              )}

              {rules.length === 0 && !live?.rules?.length && (
                <div className="panel" style={{ background: '#fff7ed', borderColor: '#fed7aa', marginBottom: '1rem' }}>
                  <p style={{ margin: 0 }}><strong>Belum ada aturan komisi untuk role {profile?.role}.</strong> Owner perlu buat aturan di <a href="/commissions">Komisi Staf</a> dengan Berlaku untuk = Semua / Peran {profile?.role} / Staf {profile?.name}. Lalu Generate untuk periode bulan ini.</p>
                </div>
              )}

              <div className="metrics-grid" style={{ marginBottom: '1rem' }}>
                <article className="metric-card"><span>Total (record)</span><strong>{rp(commission.summary?.total)}</strong></article>
                <article className="metric-card"><span>Menunggu</span><strong>{rp(commission.summary?.pending)}</strong></article>
                <article className="metric-card"><span>Disetujui</span><strong>{rp(commission.summary?.approved)}</strong></article>
                <article className="metric-card"><span>Dibayar</span><strong>{rp(commission.summary?.paid)}</strong></article>
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>Periode</th><th>Rule</th><th>Penjualan</th><th>Trx</th><th>Komisi</th><th>Status</th></tr></thead>
                  <tbody>
                    {(commission.records?.length || 0) ? commission.records.map((row) => (
                      <tr key={row.id}>
                        <td>{row.period_start} — {row.period_end}</td>
                        <td>{row.rule_name || '-'}</td>
                        <td>{rp(row.total_sales)}</td>
                        <td>{row.total_transactions}</td>
                        <td>{rp(row.commission_amount)}</td>
                        <td><span className={'status ' + row.status}>{row.status}</span></td>
                      </tr>
                    )) : <tr><td colSpan={6}>Belum ada riwayat generate komisi. Klik Generate di halaman Komisi Staf.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
