'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Kalau sudah login, langsung ke POS (jangan minta login lagi di tab baru).
  useEffect(() => {
    if (localStorage.getItem('pos_access_token')) window.location.replace('/pos');
  }, []);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Login gagal');
      localStorage.setItem('pos_access_token', body.data.accessToken);
      localStorage.setItem('pos_refresh_token', body.data.refreshToken);
      window.location.assign('/pos');
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
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button disabled={loading}>{loading ? 'Memproses…' : 'Masuk ke POS'}</button>
        {message && <p className="message" role="status">{message}</p>}
      </form>
    </main>
  );
}
