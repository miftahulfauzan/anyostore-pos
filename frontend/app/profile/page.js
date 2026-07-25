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
          if (r.status === 429) throw new Error('Rate limit komisi, coba lagi 1 menit');
          setCommission({ summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [] });
          return;
        }
        setCommission(b.data || { summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [] });
      })
      .catch(() => setCommission({ summary: { total: 0, pending: 0, approved: 0, paid: 0 }, records: [] }));
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
      setMessage('Profil berhasil diperbarui. Email untuk login sekarang yang baru.');
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

  return (
    <AppShell title="Akun Saya" eyebrow="PROFIL">
      {message && <p className="message" role="status">{message}</p>}
      <div className="product-grid">
        <section className="panel">
          <h2>Profil</h2>
          {profile ? (
            <>
              <div className="profile-card" style={{ marginBottom: '1rem' }}>
                <p><strong>Role</strong><span>{profile.role}</span></p>
                <p><strong>Toko</strong><span>{profile.branch_name || profile.branch_id}</span></p>
              </div>
              <form onSubmit={saveProfile}>
                <label>Nama<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
                <label>Email (untuk login)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
                <button type="submit" disabled={savingProfile}>{savingProfile ? 'Menyimpan…' : 'Simpan Profil'}</button>
              </form>
            </>
          ) : <p>Memuat profil…</p>}
        </section>

        <section className="panel">
          <h2>Ubah Password</h2>
          <form onSubmit={changePassword}>
            <label>Password lama<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
            <label>Password baru<input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} /></label>
            <label>Konfirmasi password baru<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
            <button type="submit" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan Password'}</button>
          </form>
        </section>

        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <h2>Komisi Saya</h2>
          {commission ? (
            <>
              <div className="metrics-grid" style={{ marginBottom: '1rem' }}>
                <article className="metric-card"><span>Total komisi</span><strong>{rp(commission.summary?.total)}</strong></article>
                <article className="metric-card"><span>Menunggu</span><strong>{rp(commission.summary?.pending)}</strong></article>
                <article className="metric-card"><span>Disetujui</span><strong>{rp(commission.summary?.approved)}</strong></article>
                <article className="metric-card"><span>Dibayar</span><strong>{rp(commission.summary?.paid)}</strong></article>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Periode</th><th>Penjualan</th><th>Transaksi</th><th>Komisi</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {(commission.records?.length || 0) ? commission.records.map((row) => (
                      <tr key={row.id}>
                        <td>{row.period_start} — {row.period_end}</td>
                        <td>{rp(row.total_sales)}</td>
                        <td>{row.total_transactions}</td>
                        <td>{rp(row.commission_amount)}</td>
                        <td>{row.status}</td>
                      </tr>
                    )) : <tr><td colSpan={5}>Belum ada komisi.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p>Memuat komisi…</p>}
        </section>
      </div>
    </AppShell>
  );
}
