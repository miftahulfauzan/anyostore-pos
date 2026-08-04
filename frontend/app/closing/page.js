'use client';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const methodLabel = { cash: 'Kas', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };
const money = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-Rp ' : 'Rp ') + Math.abs(v).toLocaleString('id-ID');
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
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 24, fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace" }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 40 }} /></label>
        <button onClick={() => window.print()} disabled={!data}>Cetak / Simpan PDF</button>
        <a className="button-link" href="/dashboard">← Kembali ke Dasbor</a>
      </div>
      {message && <p className="message" role="status">{message}</p>}
      {!data && !message && <p>Memuat laporan…</p>}
      {data && (
        <div className="closing-doc">
          <div className="closing-line">Toko: {data.store}</div>
          <div className="closing-line closing-title">Judul: {data.document}</div>
          <div className="closing-divider">========================================</div>
          <div className="closing-line">Dicetak: {shortStamp(data.printed_at)}</div>
          <div className="closing-line">Dicetak Oleh: {data.printed_by}</div>
          <div className="closing-line">Tanggal: {longDate(data.date)}</div>
          <div className="closing-divider">========================================</div>
          <div className="closing-line">Resi: {data.receipt_count}</div>
          <div className="closing-line">Pengembalian: {data.return_count}</div>
          <div className="closing-divider">========================================</div>
          <div className="closing-line">Total Penjualan: {money(data.total_sales)}</div>
          <div className="closing-line">Subtotal: {money(data.subtotal)}</div>
          <div className="closing-divider">========================================</div>
          {Object.entries(methods).map(([m, v]) => (
            <div key={m} className="closing-method">
              <div className="closing-line closing-method-name">{methodLabel[m] || m}: {money(v.total)}</div>
              <div className="closing-line closing-sub">Rincian {methodLabel[m] || m}:</div>
              {methodRows(m, v).map((r) => (
                <div key={r.label} className="closing-line closing-sub closing-detail"><span>{r.label}</span><span>{money(r.value)}</span></div>
              ))}
            </div>
          ))}
          {!Object.keys(methods).length && <div className="closing-line">Belum ada transaksi pada tanggal ini.</div>}
          <div className="closing-divider">========================================</div>
          <div className="closing-line closing-total">Total Diharapkan: {money(data.expected_total)}</div>
        </div>
      )}
      <style>{`
        .closing-doc { background: #fff; border: 1px solid #dbe3ee; border-radius: 8px; padding: 22px 18px; font-size: 13px; line-height: 1.55; color: #111827; }
        .closing-line { display: flex; justify-content: space-between; align-items: baseline; }
        .closing-line > span:first-child { text-align: left; }
        .closing-line > span:last-child { text-align: right; }
        .closing-title { font-size: 15px; font-weight: 700; }
        .closing-method-name { font-size: 14px; font-weight: 700; }
        .closing-sub { color: #374151; font-size: 12px; padding-left: 10px; }
        .closing-detail { justify-content: flex-start; gap: 12px; }
        .closing-detail span:last-child { margin-left: auto; }
        .closing-divider { white-space: pre; color: #64748b; overflow: hidden; }
        .closing-total { font-size: 14px; font-weight: 700; }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { width: 80mm; margin: 0; padding: 0; background: #fff !important; }
          .no-print { display: none !important; }
          .closing-doc { width: 80mm; margin: 0; padding: 4mm 3mm; border: 0; border-radius: 0; font-size: 11px; line-height: 1.5; }
          .closing-title { font-size: 13px; }
          .closing-method-name { font-size: 12px; }
          .closing-sub { font-size: 10px; }
          .closing-total { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
