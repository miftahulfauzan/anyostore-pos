'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;

export default function MyAccount() {
  const [profile, setProfile] = useState(null);
  const [commission, setCommission] = useState(null);
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_access_token')}` });

  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) { window.location.assign('/'); return; }
    fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setProfile(b.data); })
      .catch((e) => setMessage(e.message));
    fetch(`${api}/commissions/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setCommission(b.data); })
      .catch((e) => setMessage(e.message));
  }, []);

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
            <div className="profile-card">
              <p><strong>Nama</strong><span>{profile.name}</span></p>
              <p><strong>Email</strong><span>{profile.email}</span></p>
              <p><strong>Role</strong><span>{profile.role}</span></p>
              <p><strong>Toko</strong><span>{profile.branch_name || profile.branch_id}</span></p>
            </div>
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
                <article className="metric-card"><span>Total komisi</span><strong>{rp(commission.summary.total)}</strong></article>
                <article className="metric-card"><span>Menunggu</span><strong>{rp(commission.summary.pending)}</strong></article>
                <article className="metric-card"><span>Disetujui</span><strong>{rp(commission.summary.approved)}</strong></article>
                <article className="metric-card"><span>Dibayar</span><strong>{rp(commission.summary.paid)}</strong></article>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Periode</th><th>Penjualan</th><th>Transaksi</th><th>Komisi</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {commission.records.length ? commission.records.map((row) => (
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
