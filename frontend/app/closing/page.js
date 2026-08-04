'use client';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const methodLabel = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };

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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="closing-actions no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 40 }} /></label>
        <button onClick={() => window.print()} disabled={!data}>Cetak / Simpan PDF</button>
        <a className="button-link" href="/dashboard">← Kembali ke Dasbor</a>
      </div>
      {message && <p className="message" role="status">{message}</p>}
      {!data && !message && <p>Memuat laporan…</p>}
      {data && (
        <div className="closing-doc">
          <header className="closing-header">
            <div>
              <strong className="closing-brand">ANYOSTORE</strong>
              <h1>{data.document}</h1>
            </div>
            <div className="closing-meta">
              <p>Toko: <strong>{data.store}</strong>{data.store_address ? ` — ${data.store_address}` : ''}</p>
              <p>Tanggal laporan: <strong>{data.date}</strong></p>
              <p>Dicetak: {data.printed_at} · Oleh: {data.printed_by}</p>
            </div>
          </header>

          <div className="closing-summary">
            <div><span>Transaksi</span><strong>{data.receipt_count}</strong></div>
            <div><span>Retur</span><strong>{data.return_count}</strong></div>
            <div><span>Total Penjualan</span><strong>{rupiah(data.total_sales)}</strong></div>
            <div><span>Subtotal</span><strong>{rupiah(data.subtotal)}</strong></div>
          </div>

          <table className="closing-table">
            <thead>
              <tr><th>Metode</th><th>Penjualan</th><th>Retur</th><th>Pembatalan</th><th>Kas Masuk/Keluar</th><th>Total</th></tr>
            </thead>
            <tbody>
              {Object.entries(methods).map(([m, v]) => (
                <tr key={m}>
                  <td>{methodLabel[m] || m}</td>
                  <td>{rupiah(v.sales)}</td>
                  <td>{rupiah(v.returns)}</td>
                  <td>{rupiah(v.cancellations)}</td>
                  <td>{rupiah(v.cash_in_out)}</td>
                  <td><strong>{rupiah(v.total)}</strong></td>
                </tr>
              ))}
              {!Object.keys(methods).length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>Belum ada transaksi pada tanggal ini.</td></tr>}
            </tbody>
            <tfoot>
              <tr><th colSpan={5}>Total Kas Diharapkan</th><th>{rupiah(data.expected_total)}</th></tr>
            </tfoot>
          </table>
        </div>
      )}
      <style>{`
        .closing-doc { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; }
        .closing-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
        .closing-brand { font-size: 14px; letter-spacing: .14em; color: #1e3a5f; }
        .closing-header h1 { margin: 4px 0 0; font-size: 22px; color: #111827; }
        .closing-meta { text-align: right; font-size: 12px; color: #475569; }
        .closing-meta p { margin: 2px 0; }
        .closing-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
        .closing-summary > div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; }
        .closing-summary span { display: block; font-size: 11px; color: #64748b; }
        .closing-summary strong { display: block; font-size: 18px; color: #1e3a5f; margin-top: 2px; }
        .closing-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .closing-table th, .closing-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; }
        .closing-table th { background: #1e3a5f; color: #fff; text-align: left; }
        .closing-table td:first-child { text-align: left; font-weight: 600; }
        .closing-table tfoot th { background: #f1f5f9; color: #111827; text-align: right; }
        @media (max-width: 700px) {
          .closing-header { flex-direction: column; }
          .closing-meta { text-align: left; }
          .closing-summary { grid-template-columns: repeat(2, 1fr); }
        }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { width: 80mm; margin: 0; padding: 0; background: #fff !important; }
          .no-print { display: none !important; }
          .closing-doc { width: 80mm; margin: 0; padding: 4mm 3mm; border: 0; border-radius: 0; font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace; font-size: 10px; }
          .closing-header { flex-direction: column; align-items: center; text-align: center; border-bottom: 1px dashed #666; padding-bottom: 3mm; }
          .closing-brand { font-size: 10px; letter-spacing: .1em; color: #111827; }
          .closing-header h1 { font-size: 13px; margin-top: 2px; }
          .closing-meta { text-align: center; font-size: 8px; }
          .closing-summary { grid-template-columns: 1fr 1fr; gap: 1mm; margin: 3mm 0; }
          .closing-summary > div { border: 0; border-bottom: 1px dotted #bbb; border-radius: 0; padding: 1mm 0; text-align: left; }
          .closing-summary span { font-size: 8px; color: #333; }
          .closing-summary strong { font-size: 11px; color: #000; }
          .closing-table { font-size: 8px; }
          .closing-table th, .closing-table td { border: 0; border-bottom: 1px dotted #bbb; padding: 1mm 1.5mm; text-align: right; }
          .closing-table th { background: transparent; color: #111827; text-align: left; border-bottom: 1px solid #666; }
          .closing-table td:first-child { text-align: left; }
          .closing-table tfoot th { background: transparent; color: #111827; border-top: 1px solid #666; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
