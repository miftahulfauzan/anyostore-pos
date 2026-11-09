'use client';
import { useEffect, useState } from 'react';
import { useAppSession } from '../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const currentLocalDate = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};
const methodLabel = { cash: 'Kas', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };
const rp = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-Rp' : 'Rp') + Math.abs(v).toLocaleString('id-ID');
};
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortStamp = (s) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s || '');
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ClosingPage() {
  const { user, activeBranchId, resolved } = useAppSession();
  const [data, setData] = useState(null);
  const [date, setDate] = useState(currentLocalDate());
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const selectedBranchQuery = activeBranchId === 'all' ? 'all' : activeBranchId;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPreview(params.get('preview') === '1');
    const queryDate = params.get('date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate || '')) setDate(queryDate);
  }, []);

  useEffect(() => {
    if (!resolved || !user || !activeBranchId) return undefined;
    setData(null);
    setMessage('');
    const query = new URLSearchParams({ date });
    if (user.role === 'owner') {
      if (selectedBranchQuery === 'all') query.set('branch_id', 'all');
      else query.set('branch_id', activeBranchId);
    }
    fetch(`${api}/reports/daily-closing?${query.toString()}`, { headers: {} })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setData(b.data); })
      .catch((e) => setMessage(e.message));
    return undefined;
  }, [date, user, activeBranchId, resolved]);

  function openPdfPreview() {
    const query = new URLSearchParams({ date, preview: '1' });
    if (user?.role === 'owner') {
      if (selectedBranchQuery === 'all') query.set('branch_id', 'all');
      else query.set('branch_id', activeBranchId);
    }
    window.open(`/closing?${query.toString()}`, '_blank');
  }

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
    <div className={`closing-wrap${preview ? ' closing-preview-mode' : ''}`} style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 40 }} /></label>
        <button type="button" onClick={openPdfPreview} disabled={!data}>Lihat PDF</button>
        <button type="button" onClick={() => window.print()} disabled={!data}>Cetak Penutupan</button>
        <a className="button-link" href="/dashboard">← Kembali ke Dasbor</a>
      </div>
      {message && <p className="message" role="status">{message}</p>}
      {user?.role === 'owner' && (activeBranchId === 'all' || activeBranchId == null) && !preview && <p className="muted no-print">Pilih satu toko untuk melihat rincian per toko; mode Semua tetap menampilkan gabungan.</p>}
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
              <div className="receipt-summary-row"><span>Pengeluaran</span><b>{rp(data.expenses)}</b></div>
              <div className="receipt-summary-row"><span>Pemasukan</span><b>{rp(data.income)}</b></div>
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
