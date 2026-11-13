'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Printer } from 'lucide-react';
import { openPrintView } from '../lib/print-utils';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const methodLabels = { cash: 'Kas', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };
const rp = (value) => (Number(value || 0) < 0 ? '-Rp' : 'Rp') + Math.abs(Number(value || 0)).toLocaleString('id-ID');
const longDate = (value) => {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ReportClosingPanel({ date, branchId, role }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!date) return undefined;
    let active = true;
    const query = new URLSearchParams({ date });
    if (role === 'owner' && branchId) query.set('branch_id', branchId);
    setLoading(true);
    setMessage('');
    setData(null);
    const controller = new AbortController();
    fetch(`${api}/reports/daily-closing?${query.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Penutupan tidak dapat dimuat.');
        return body.data;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((error) => {
        if (active && error?.name !== 'AbortError') setMessage(error.message || 'Penutupan tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [date, branchId, role]);

  const methods = data?.methods || {};
  const methodEntries = Object.entries(methods);

  return (
    <section className="panel report-closing" id="report-closing">
      <div className="report-closing-head">
        <div>
          <span className="eyebrow">PENUTUPAN KAS</span>
          <h2>{longDate(data?.date || date)}</h2>
          <p className="muted">Data penutupan ditampilkan di layar dan siap dicetak.</p>
        </div>
        <div className="report-closing-actions no-print">
          <button
            type="button"
            className="button-link"
            onClick={() => openPrintView({ selector: '#report-closing', title: `Penutupan ${date}` })}
            disabled={!data || loading}
          >
            <Printer aria-hidden="true" size={15} /> Cetak penutupan
          </button>
          <button type="button" className="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <ChevronDown aria-hidden="true" size={15} className={open ? 'chevron-open' : ''} /> {open ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {message ? <p className="message" role="alert">{message}</p> : null}
      {loading && !data ? <p className="muted">Memuat penutupan…</p> : null}

      {open && data && !message ? (
        <div className="report-closing-body">
          <div className="report-closing-grid">
            <div><span>Resi</span><strong>{data.receipt_count}</strong></div>
            <div><span>Pengembalian</span><strong>{data.return_count}</strong></div>
            <div><span>Total penjualan</span><strong>{rp(data.total_sales)}</strong></div>
            <div><span>Subtotal</span><strong>{rp(data.subtotal)}</strong></div>
            <div><span>Pengeluaran</span><strong>{rp(data.expenses)}</strong></div>
            <div><span>Pemasukan</span><strong>{rp(data.income)}</strong></div>
            <div className="is-total"><span>Total diharapkan</span><strong>{rp(data.expected_total)}</strong></div>
          </div>

          <div className="report-closing-methods">
            {methodEntries.length ? methodEntries.map(([method, value]) => (
              <article key={method}>
                <header><strong>{methodLabels[method] || method}</strong><b>{rp(value.total)}</b></header>
                <div><span>Penjualan</span><span>{rp(value.sales)}</span></div>
                <div><span>Pengembalian</span><span>{rp(value.returns)}</span></div>
                <div><span>Pembatalan</span><span>{rp(value.cancellations)}</span></div>
                {method === 'cash' ? <div><span>Kas masuk/keluar</span><span>{rp(value.cash_in_out)}</span></div> : null}
              </article>
            )) : <p className="muted">Belum ada pembayaran pada tanggal ini.</p>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
