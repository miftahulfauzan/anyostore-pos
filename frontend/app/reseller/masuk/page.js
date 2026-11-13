'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, cardStyle, inputStyle, labelStyle, linkStyle, pageStyle, primaryButton, shellStyle, T } from '../ui';

export default function ResellerLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Sudah punya sesi? langsung ke halaman akun.
  useEffect(() => {
    fetch(`${api}/reseller/me`, { credentials: 'include' })
      .then((response) => response.json())
      .then((body) => { if (body.data) router.replace('/akun'); })
      .catch(() => {});
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${api}/reseller/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal masuk');
      router.replace('/akun');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <a href="/" style={{ ...linkStyle, fontSize: 12 }}>← Kembali ke katalog</a>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Masuk akun reseller</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            Dengan akun, Anda bisa menyimpan alamat, melihat riwayat, dan melacak pesanan.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
            <label style={labelStyle}>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                style={inputStyle}
              />
            </label>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
            Belum punya akun? <a href="/daftar" style={linkStyle}>Daftar di sini</a>
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>
            Lupa password? Hubungi admin melalui WhatsApp - admin akan memberi password sementara.
          </p>
        </div>
      </div>
    </main>
  );
}