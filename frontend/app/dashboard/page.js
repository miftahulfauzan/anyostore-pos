'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Banknote, CalendarDays, CreditCard, ReceiptText, Store } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import { createRequestSequence } from '../components/app-state.cjs';
import WarehouseDashboard from './WarehouseDashboard';
import { labelFor, paymentLabels } from '../lib/ui-labels';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const localDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const fullDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}/${year}` : '-'; };

export default function DashboardPage() {
  const router = useRouter();
  const { user, activeBranchId } = useAppSession();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [range, setRange] = useState({ start: '', end: '' });
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const dashboardLoadSequence = useRef(createRequestSequence());

  useEffect(() => {
    const end = localDate();
    const startDate = new Date(`${end}T00:00:00+07:00`);
    startDate.setDate(startDate.getDate() - 6);
    const start = localDate(startDate);
    setRange({ start, end });
    setDraftStart(start);
    setDraftEnd(end);
  }, []);

  useEffect(() => {
    if (!range.start || !range.end) return undefined;
    const requestId = dashboardLoadSequence.current.next();
    setData(null);
    setMessage('');
    async function loadDashboard() {
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (user?.role === 'owner' && activeBranchId) query.set('branch_id', activeBranchId);
      let response = await fetch(apiUrl + '/dashboard?' + query, { headers: {} });
      if (response.status === 401) {
        const refreshResponse = await fetch(apiUrl + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (refreshResponse.ok) {
          response = await fetch(apiUrl + '/dashboard?' + query, { headers: {} });
        }
      }
      return response;
    }
    loadDashboard()
      .then(async (response) => {
        const body = await response.json();
        if (!dashboardLoadSequence.current.isCurrent(requestId)) return;
        if (!response.ok) throw new Error(body.message);
        setData(body.data);
      })
      .catch((error) => {
        if (!dashboardLoadSequence.current.isCurrent(requestId)) return;
        if (/token|401/i.test(error.message || '')) {
          localStorage.removeItem('pos_access_token');
          localStorage.removeItem('pos_refresh_token');
          router.replace('/');
          return;
        }
        setMessage(error.message || 'Dasbor tidak dapat dimuat');
      });
    return () => { dashboardLoadSequence.current.next(); };
  }, [range, activeBranchId, user?.role]);

  const role = user?.role || null;
  const isGudang = role === 'gudang';
  const summary = data?.owner_summary || data?.summary || {};
  const peakSales = Math.max(1, ...(data?.sales_trend || []).map((item) => Number(item.sales)));
  const paymentTotal = Math.max(1, ...(data?.payment_breakdown || []).map((item) => Number(item.amount)));

  return <AppShell title="Dasbor" eyebrow={isGudang ? 'RINGKASAN GUDANG' : 'RINGKASAN TOKO'} actions={isGudang ? <><Link className="button-link" href="/inventory">Kelola Stok</Link><a className="button-link" href="/" target="_blank" rel="noopener noreferrer">Landing Page</a></> : <><a className="button-link" href="/" target="_blank" rel="noopener noreferrer">Landing Page</a><Link className="button-link" href="/closing">Cetak Penutupan</Link><Link className="button-link" href="/pos">Buka Kasir <ArrowUpRight aria-hidden="true" size={15} /></Link></>}>
    {message && <p className="message" role="status">{message}</p>}
    {!data ? <section className="panel"><p>Memuat ringkasan toko…</p></section> : isGudang ? (
      <>
        <section className="warehouse-dashboard-toolbar"><div><span className="eyebrow">DASHBOARD GUDANG</span><h2>Periode {fullDate(range.start)} – {fullDate(range.end)}</h2></div><div className="warehouse-date-filter"><label>Dari<input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} /></label><span>s/d</span><label>Sampai<input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} /></label><button type="button" onClick={() => setRange({ start: draftStart, end: draftEnd })}>Terapkan</button></div></section>
        <WarehouseDashboard data={data} start={range.start} end={range.end} />
      </>
    ) : <>
      {role === 'owner' && activeBranchId === 'all' && <p className="dashboard-note"><Store aria-hidden="true" size={15} /> Menampilkan gabungan seluruh toko/gudang.</p>}
      <section className="metrics-grid dashboard-metrics" aria-label="Ringkasan penjualan dan pengeluaran">
        <article className="metric-card sales-metric"><span className="metric-icon"><Banknote aria-hidden="true" size={17} /></span><div><span>Penjualan hari ini</span><strong>{rupiah(summary.today_sales)}</strong><small>{summary.today_transactions || 0} transaksi selesai</small></div></article>
        <article className="metric-card sales-metric"><span className="metric-icon"><CalendarDays aria-hidden="true" size={17} /></span><div><span>Penjualan 7 hari</span><strong>{rupiah(summary.seven_day_sales)}</strong><small>Termasuk hari ini</small></div></article>
        <article className="metric-card sales-metric"><span className="metric-icon"><CreditCard aria-hidden="true" size={17} /></span><div><span>Penjualan bulan ini</span><strong>{rupiah(summary.month_sales)}</strong><small>Akumulasi bulan berjalan</small></div></article>
        <article className="metric-card expense-metric"><span className="metric-icon"><ReceiptText aria-hidden="true" size={17} /></span><div><span>Pengeluaran hari ini</span><strong>{rupiah(summary.today_expenses)}</strong><small>Pending dan disetujui</small></div></article>
        <article className="metric-card expense-metric"><span className="metric-icon"><ReceiptText aria-hidden="true" size={17} /></span><div><span>Pengeluaran 7 hari</span><strong>{rupiah(summary.seven_day_expenses)}</strong><small>Termasuk hari ini</small></div></article>
        <article className="metric-card expense-metric"><span className="metric-icon"><ReceiptText aria-hidden="true" size={17} /></span><div><span>Pengeluaran bulan ini</span><strong>{rupiah(summary.month_expenses)}</strong><small>Akumulasi bulan berjalan</small></div></article>
      </section>
      <section className="dashboard-grid dashboard-charts">
        <section className="panel"><div className="section-heading"><div><h2>Penjualan 7 hari terakhir</h2><p>Nilai transaksi selesai per hari, termasuk hari tanpa penjualan.</p></div></div><div className="bar-chart">{data.sales_trend.map((item) => <div className="bar-column" key={item.date}><strong>{rupiah(item.sales)}</strong><span className="bar" style={{ height: Math.max(8, Number(item.sales) / peakSales * 150) + 'px' }} /><small>{item.label}</small></div>)}</div></section>
        <section className="panel"><div className="section-heading"><div><h2>Metode pembayaran</h2><p>Komposisi pembayaran 30 hari terakhir.</p></div></div><div className="payment-bars">{data.payment_breakdown?.length ? data.payment_breakdown.map((item) => <div key={item.payment_method}><div><span>{labelFor(paymentLabels, item.payment_method)}</span><strong>{rupiah(item.amount)}</strong></div><span className="payment-bar"><i style={{ width: Number(item.amount) / paymentTotal * 100 + '%' }} /></span></div>) : <p>Belum ada data pembayaran.</p>}</div></section>
      </section>
      {role === 'owner' && activeBranchId === 'all' && data.stores?.length > 1 && <section className="panel store-summary"><div className="section-heading"><div><h2>Ringkasan semua toko</h2><p>Perbandingan cabang untuk owner/admin utama.</p></div></div><div className="store-summary-grid">{data.stores.map((store) => <article key={store.id}><header><div><strong>{store.name}</strong><span>{store.address || 'Alamat belum diatur'}</span></div><b>{store.products} produk</b></header><dl><div><dt>Hari ini</dt><dd>{rupiah(store.today_sales)}</dd></div><div><dt>7 hari</dt><dd>{rupiah(store.seven_day_sales)}</dd></div><div><dt>Pengeluaran bulan ini</dt><dd>{rupiah(store.month_expenses)}</dd></div></dl></article>)}</div></section>}
      <section className="panel dashboard-recent"><div className="section-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan terakhir.</p></div><Link href="/history">Lihat semua</Link></div><div className="data-list">{data.recent_transactions.length ? data.recent_transactions.map((tx) => <article key={tx.id}><div><strong>{tx.invoice_no}</strong><span>{tx.cashier}{data.owner_summary ? ' · ' + tx.branch_name : ''} · {new Date(tx.created_at).toLocaleString('id-ID')}</span></div><div><strong>{rupiah(tx.grand_total)}</strong><span className="tag">{labelFor(paymentLabels, tx.payment_method)}</span></div></article>) : <p>Belum ada transaksi.</p>}</div></section>
    </>}
  </AppShell>;
}
