'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function homeFor(role) {
  // Owner & admin gudang mendarat di dashboard; kasir/manajer/admin tetap POS.
  if (role === 'owner' || role === 'gudang') return '/dashboard';
  return '/pos';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('password');
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  // Sesi yang masih valid langsung diarahkan; form tetap tampil selama
  // pengecekan berjalan agar pengguna tidak melihat layar kosong.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${apiUrl}/auth/me`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const body = await response.json();
        const role = body?.data?.role;
        if (!cancelled && role) window.location.replace(homeFor(role));
      } catch {
        // Jaringan gagal: tetap tampilkan form, jangan blokir login.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/${mode === 'pin' ? 'login-pin' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'pin'
          ? { email, pin, remember_account: remember }
          : { email, password, remember_account: remember })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Login gagal');
      // Login berhasil meski akun tidak jadi disimpan (batas 8 akun).
      if (remember && body.data?.account_saved === false) {
        setMessage('Berhasil masuk, tetapi akun tidak dapat disimpan (batas 8 akun tersimpan per browser).');
        setTimeout(() => window.location.assign(homeFor(body.data?.user?.role)), 1200);
        return;
      }
      window.location.assign(homeFor(body.data?.user?.role));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="login-page">
      <form className="login" onSubmit={submit}>
        <div className="login-logo"><span>A</span> Anyostore</div>
        <div><p className="eyebrow">SELAMAT DATANG</p><h2>Masuk ke akun Anda</h2><p className="muted">Gunakan akun pegawai atau owner yang terdaftar.</p></div>
        <div className="login-mode-switch">
          <button type="button" className={`login-mode-button${mode === 'password' ? ' selected' : ''}`} onClick={() => setMode('password')}>Password</button>
          <button type="button" className={`login-mode-button${mode === 'pin' ? ' selected' : ''}`} onClick={() => setMode('pin')}>PIN</button>
        </div>
        <label>Email / Username<input name="username" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email atau username" required /></label>
        {mode === 'pin' ? (
          <label>PIN (6 digit)<input name="pin" autoComplete="one-time-code" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} required /></label>
        ) : (
          <label>Password<input name="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        )}
        <label className="login-remember">
          <input type="checkbox" name="remember_account" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>Ingat akun ini</span>
        </label>
        <button type="submit" disabled={loading || checking}>{loading ? 'Memproses…' : 'Masuk ke POS'}</button>
        {message && <p className="message" role="status">{message}</p>}
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', textAlign: 'center', marginTop: 6, paddingBottom: 2 }}><a href="/">← Kembali ke Grosir</a></p>
      </form>
    </main>
  );
}
