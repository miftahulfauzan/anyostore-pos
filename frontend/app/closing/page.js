'use client';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const methodLabel = { cash: 'Kas', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };
const rp = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-Rp' : 'Rp') + Math.abs(v).toLocaleString('id-ID');
};
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortStamp = (s) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ClosingPage() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState(localToday());
  const [message, setMessage] = useState('');
  const [printed, setPrinted] = useState(false);
  const token = () => localStorage.getItem('pos_access_token');

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    setData(null);
    setPrinted(false);
    fetch(`${api}/reports/daily-closing?date=${date}`, { headers: { Authorization: 'Bearer ' + token() } })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setData(b.data); })
      .catch((e) => setMessage(e.message));
  }, [date]);

  useEffect(() => {
    if (data && !printed) {
      setPrinted(true);
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data, printed]);

  const methods = data?.methods || {};
  const methodRows = (m, v) => {
    const cash = m === 'cash';
    const rows = [
      { label: cash ? 'Kas Penjualan' : 'Penjualan', value: v.sales },
      { label: cash ? 'Kas Pengembalian' : 'Pengembalian', value: v.returns },
      { label: cash ? 'Kas Pembatalan' : 'Batal', value: v.cancellations },
    ];
    if (cash) rows.push({ label: 'Kas Masuk-Keluar', value: v.cash_in_out });
    return rows;
  };

  return (
    <div className="closing-wrap" style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 40 }} /></label>
        <button onClick={() => window.print()} disabled={!data}>Cetak / Simpan PDF</button>
        <a className="button-link" href="/dashboard">← Kembali ke Dasbor</a>
      </div>
      {message && <p className="message" role="status">{message}</p>}
      {!data && !message && <p>Memuat laporan…</p>}
      {data && (
        <main className="receipt">
          <article className="receipt-paper">
            <header className="receipt-store">
              <h1>{data.store}</h1>
              <p className="receipt-store-tagline">{data.document}</p>
              {data.store_address && <address><span>{data.store_address}</span></address>}
            </header>

            <section className="receipt-section receipt-invoice">
              <h2>Informasi</h2>
              <dl>
                <div><dt>Tanggal</dt><dd>{longDate(data.date)}</dd></div>
                <div><dt>Dicetak</dt><dd>{shortStamp(data.printed_at)}</dd></div>
                <div><dt>Oleh</dt><dd>{data.printed_by}</dd></div>
              </dl>
            </section>

            <section className="receipt-section">
              <h2>Ringkasan</h2>
              <div className="receipt-summary-row"><span>Resi</span><b>{data.receipt_count}</b></div>
              <div className="receipt-summary-row"><span>Pengembalian</span><b>{data.return_count}</b></div>
              <div className="receipt-summary-row strong"><span>Total Penjualan</span><b>{rp(data.total_sales)}</b></div>
              <div className="receipt-summary-row"><span>Subtotal</span><b>{rp(data.subtotal)}</b></div>
            </section>

            <section className="receipt-section">
              <h2>Pembayaran</h2>
              {Object.entries(methods).map(([m, v]) => (
                <div key={m} className="closing-method">
                  <div className="receipt-summary-row strong"><span>{methodLabel[m] || m}</span><b>{rp(v.total)}</b></div>
                  <div className="receipt-payment-detail">
                    {methodRows(m, v).map((r) => (
                      <div key={r.label} className={`receipt-summary-row${Number(r.value) < 0 ? ' negative' : ''}`}><span>{r.label}</span><b>{rp(r.value)}</b></div>
                    ))}
                  </div>
                </div>
              ))}
              {!Object.keys(methods).length && <p>Belum ada transaksi pada tanggal ini.</p>}
            </section>

            <section className="receipt-section">
              <div className="receipt-summary-row strong"><span>Total Diharapkan</span><b>{rp(data.expected_total)}</b></div>
            </section>

            <footer className="receipt-footer">
              <strong>Terima kasih</strong>
              <small>Simpan dokumen ini sebagai bukti penutupan kas.</small>
            </footer>
          </article>
        </main>
      )}
      <style>{`
        .closing-method { margin-bottom: 12px; }
        .closing-method:last-child { margin-bottom: 0; }
        @media print {
          .closing-wrap { padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
