'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, cardStyle, inputStyle, labelStyle, linkStyle, pageStyle, primaryButton, shellStyle, T } from '../ui';

export default function ResellerRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${api}/reseller/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Pendaftaran gagal');
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
          <h1 style={{ margin: 0, fontSize: 20 }}>Daftar akun reseller</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            Akun langsung aktif. Password minimal 8 karakter.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
            <label style={labelStyle}>
              Nama lengkap
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email
              <input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              No WhatsApp
              <input required inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={inputStyle} placeholder="08xxxxxxxxxx" />
            </label>
            <label style={labelStyle}>
              Password
              <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} style={inputStyle} />
            </label>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
            <button type="submit" disabled={busy} style={primaryButton}>
              {busy ? 'Mendaftar…' : 'Daftar'}
            </button>
          </form>
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
            Sudah punya akun? <a href="/masuk" style={linkStyle}>Masuk</a>
          </p>
        </div>
      </div>
    </main>
  );
}