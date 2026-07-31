'use client';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;

export default function ClosingPrintPage() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [id, setId] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) { window.location.assign('/'); return; }
    const match = window.location.pathname.match(/\/operations\/closing\/(\d+)/);
    const closingId = match ? match[1] : '';
    setId(closingId);
    if (!closingId) return;
    fetch(`${api}/cash-drawer/closing/${closingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setData(b.data); })
      .catch((e) => setMessage(e.message));
  }, []);

  function print() { window.print(); }

  if (message) return <main className="closing-print"><p className="message">{message}</p></main>;
  if (!data) return <main className="closing-print"><p>Memuat penutupan…</p></main>;

  return (
    <main className="closing-print">
      <div className="no-print" style={{ marginBottom: '1rem' }}>
        <button onClick={print}><Printer size={16} /> Cetak / Simpan PDF</button>
      </div>
      <header>
        <h1>Laporan Penutupan Kas</h1>
        <p>{data.branch_name}</p>
        <p>Kasir: {data.cashier}</p>
        <p>Dibuka: {new Date(data.opened_at).toLocaleString('id-ID')}</p>
        <p>Ditutup: {data.closed_at ? new Date(data.closed_at).toLocaleString('id-ID') : '—'}</p>
      </header>
      <section>
        <h2>Ringkasan</h2>
        <table>
          <tbody>
            <tr><td>Modal awal</td><td>{rupiah(data.opening_amount)}</td></tr>
            <tr><td>Kas seharusnya</td><td>{rupiah(data.expected_cash)}</td></tr>
            <tr><td>Kas aktual</td><td>{rupiah(data.actual_cash)}</td></tr>
            <tr><td>Selisih</td><td>{rupiah(data.difference)}</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>Pembayaran Tunai</h2>
        {data.payments?.length ? (
          <table>
            <thead><tr><th>Metode</th><th>Transaksi</th><th>Nilai</th></tr></thead>
            <tbody>{data.payments.map((p, i) => <tr key={i}><td>{p.payment_method}</td><td>{p.transactions}</td><td>{rupiah(p.amount)}</td></tr>)}</tbody>
          </table>
        ) : <p className="muted">Tidak ada pembayaran tunai.</p>}
      </section>
      <section>
        <h2>Mutasi Kas</h2>
        {data.movements?.length ? (
          <table>
            <thead><tr><th>Waktu</th><th>Tipe</th><th>Nominal</th><th>Alasan</th><th>Oleh</th></tr></thead>
            <tbody>{data.movements.map((m, i) => <tr key={i}><td>{new Date(m.created_at).toLocaleString('id-ID')}</td><td>{m.type}</td><td>{rupiah(m.amount)}</td><td>{m.reason}</td><td>{m.user_name}</td></tr>)}</tbody>
          </table>
        ) : <p className="muted">Tidak ada mutasi kas.</p>}
      </section>
      {data.notes && <section><h2>Catatan Selisih</h2><p>{data.notes}</p></section>}
    </main>
  );
}
