'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('password');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const modeButton = (active) => ({
    flex: 1,
    minHeight: 40,
    borderRadius: '.55rem',
    border: active ? '1.5px solid #1e3a5f' : '1px solid var(--border, #e5e7eb)',
    background: active ? '#1e3a5f' : '#fff',
    color: active ? '#fff' : '#52525b',
    fontWeight: 700,
    cursor: 'pointer',
  });

  useEffect(() => {
    if (localStorage.getItem('pos_access_token')) window.location.replace('/pos');
  }, []);

  function homeFor(role) {
    return role === 'gudang' ? '/dashboard' : '/pos';
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/${mode === 'pin' ? 'login-pin' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'pin' ? { email, pin } : { email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Login gagal');
      localStorage.setItem('pos_access_token', body.data.accessToken);
      localStorage.setItem('pos_refresh_token', body.data.refreshToken);
      window.location.assign(homeFor(body.data?.user?.role));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login" onSubmit={submit}>
        <div className="login-logo"><span>A</span> Anyostore</div>
        <div><p className="eyebrow">SELAMAT DATANG</p><h2>Masuk ke akun Anda</h2><p className="muted">Gunakan akun pegawai atau owner yang terdaftar.</p></div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" style={modeButton(mode === 'password')} onClick={() => setMode('password')}>Password</button>
          <button type="button" style={modeButton(mode === 'pin')} onClick={() => setMode('pin')}>PIN</button>
        </div>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {mode === 'pin' ? (
          <label>PIN (6 digit)<input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} required /></label>
        ) : (
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        )}
        <button disabled={loading}>{loading ? 'Memproses…' : 'Masuk ke POS'}</button>
        {message && <p className="message" role="status">{message}</p>}
        <p className="muted" style={{ fontSize: '.85rem', textAlign: 'center', marginTop: 6, paddingBottom: 2 }}><a href="/">← Kembali ke Grosir</a></p>
      </form>
    </main>
  );
}
