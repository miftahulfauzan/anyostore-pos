'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;

const now = new Date();
const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
const todayStr = now.toISOString().slice(0, 10);

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
  const [range, setRange] = useState({ start: firstOfMonth, end: todayStr });
  const [loadingComm, setLoadingComm] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_access_token')}` });

  async function safeJson(r) {
    try { return await r.json(); } catch { return { success: false, message: `HTTP ${r.status}` }; }
  }

  async function fetchCommission(start, end) {
    const token = localStorage.getItem('pos_access_token');
    if (!token) return;
    setLoadingComm(true);
    try {
      const qs = new URLSearchParams({ start, end }).toString();
      const r = await fetch(`${api}/commissions/mine?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const b = await safeJson(r);
      if (!r.ok) {
        setCommission({ live: { period_start: start, period_end: end, total_sales: 0, total_transactions: 0, estimated: 0, rules: [] }, applicable_rules: [] });
        return;
      }
      setCommission(b.data);
    } catch {
      setCommission({ live: { period_start: start, period_end: end, total_sales: 0, total_transactions: 0, estimated: 0, rules: [] }, applicable_rules: [] });
    } finally { setLoadingComm(false); }
  }

  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) { window.location.assign('/'); return; }
    fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const b = await safeJson(r);
        if (!r.ok) throw new Error(b.message || `Gagal ambil profil (${r.status})`);
        setProfile(b.data);
        setName(b.data?.name || '');
        setEmail(b.data?.email || '');
      })
      .catch((e) => setMessage(e.message || String(e)));
    fetchCommission(range.start, range.end);
  }, []);

  function applyRange() {
    if (range.start > range.end) return setMessage('Tanggal mulai tidak boleh setelah akhir');
    fetchCommission(range.start, range.end);
  }

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
              <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            <div>
              <h2>Komisi Saya</h2>
              <p>Live dari transaksi — pilih rentang tanggal.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginBottom: '1rem' }}>
            <label style={{ minWidth: 160 }}>Dari<input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
            <label style={{ minWidth: 160 }}>Sampai<input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
            <button type="button" onClick={applyRange} disabled={loadingComm} style={{ minHeight: 40 }}>{loadingComm ? 'Memuat…' : 'Tampilkan'}</button>
            <span className="muted" style={{ alignSelf: 'center', fontSize: '.85rem' }}>{live?.period_start} → {live?.period_end}</span>
          </div>

          {!commission && <p>Memuat komisi…</p>}

          {commission && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'grid', placeItems: 'center', gap: '.35rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '.5rem', background: 'var(--card)', textAlign: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>Penjualan</span>
                  <strong style={{ fontSize: '1.05rem' }}>{rp(live?.total_sales)}</strong>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', gap: '.35rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '.5rem', background: 'var(--card)', textAlign: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>Transaksi</span>
                  <strong style={{ fontSize: '1.2rem' }}>{live?.total_transactions}</strong>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', gap: '.35rem', padding: '1rem', border: '1px solid #bbf7d0', borderRadius: '.5rem', background: '#f0fdf4', textAlign: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: '#15803d', fontWeight: 700, textTransform: 'uppercase' }}>Estimasi Komisi</span>
                  <strong style={{ fontSize: '1.15rem', color: '#16a34a' }}>{rp(live?.estimated)}</strong>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', gap: '.2rem', padding: '.75rem', border: '1px solid var(--border)', borderRadius: '.5rem', background: 'var(--card)', textAlign: 'center' }}>
                  <span style={{ fontSize: '.68rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Reguler pcs</span>
                  <strong>{live?.qty_reguler || 0}</strong>
                  <span style={{ fontSize: '.68rem', color: 'var(--muted-foreground)' }}>Semi {live?.qty_semi_grosir || 0} • Grosir {live?.qty_grosir_seri || 0}</span>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', gap: '.35rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '.5rem', background: 'var(--card)', textAlign: 'center' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>Aturan</span>
                  <strong style={{ fontSize: '1.2rem' }}>{live?.rules?.length || 0}</strong>
                </div>
              </div>

              {live?.rules?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Aturan</th><th>Tipe</th><th>Detail per pcs</th><th>Komisi</th></tr></thead>
                    <tbody>
                      {live.rules.map((r) => (
                        <tr key={r.rule_id}>
                          <td>{r.name}</td>
                          <td><span className="tag" style={{ fontSize: '.75rem' }}>{r.type}</span></td>
                          <td style={{ fontSize: '.85rem' }}>
                            {r.type === 'per_pcs_customer_tier'
                              ? <>Reg {rp(r.commission_reguler_per_pcs)}/pcs • Semi {rp(r.commission_semi_grosir_per_pcs)} • Grosir {rp(r.commission_grosir_seri_per_pcs)} (Reg {r.qty_breakdown?.reguler || 0} • Semi {r.qty_breakdown?.semi_grosir || 0} • Grosir {r.qty_breakdown?.grosir_seri || 0} pcs)</>
                              : r.type?.includes('percentage') ? `${r.percentage}%` : rp(r.flat_amount)
                            }
                          </td>
                          <td><strong>{rp(r.commission)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel" style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
                  <p style={{ margin: 0 }}>
                    {rules.length === 0
                      ? <>Belum ada aturan komisi untuk role <strong>{profile?.role}</strong>. Owner buat di <a href="/commissions">Komisi Staf</a> → Berlaku untuk = Semua / role {profile?.role}.</>
                      : <>Penjualan / transaksi di rentang ini belum memenuhi min. target aturan atau tidak ada transaksi.</>}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
