'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, cardStyle, inputStyle, labelStyle, linkStyle, pageStyle, primaryButton, shellStyle, T } from '../ui';

export default function ResellerTrackPage() {
  const router = useRouter();
  const [form, setForm] = useState({ order_no: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ order_no: form.order_no.trim(), phone: form.phone.trim() });
      const response = await fetch(`${api}/reseller/orders/lookup?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Pesanan tidak ditemukan');
      router.push(`/pesanan/${body.data.public_token}`);
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
          <h1 style={{ margin: 0, fontSize: 20 }}>Lacak pesanan</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            Masukkan nomor pesanan (contoh: RS-20261115-B3-0001) dan nomor WhatsApp yang dipakai saat memesan.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
            <label style={labelStyle}>
              Nomor pesanan
              <input required value={form.order_no} onChange={(event) => setForm({ ...form, order_no: event.target.value })} style={inputStyle} placeholder="RS-YYYYMMDD-B<id>-0001" />
            </label>
            <label style={labelStyle}>
              Nomor WhatsApp
              <input required inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={inputStyle} placeholder="08xxxxxxxxxx" />
            </label>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
            <button type="submit" disabled={busy} style={primaryButton}>{busy ? 'Mencari…' : 'Cari pesanan'}</button>
          </form>
          <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
            Lebih mudah kalau punya akun: <a href="/masuk" style={linkStyle}>masuk di sini</a> untuk melihat semua pesanan.
          </p>
        </div>
      </div>
    </main>
  );
}