'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Banknote, CalendarDays, CreditCard, ReceiptText, Sparkles } from 'lucide-react';
import AppShell from '../components/AppShell';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState(null);

  useEffect(() => {
    /* sesi via httpOnly cookie */
    fetch(apiUrl + '/auth/me', { headers: {} })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role) setRole(b.data.role); })
      .catch(() => {});
    async function loadDashboard() {
      let response = await fetch(apiUrl + '/dashboard', { headers: {} });
      if (response.status === 401) {
        const refreshResponse = await fetch(apiUrl + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (refreshResponse.ok) {
          response = await fetch(apiUrl + '/dashboard', { headers: {} });
        }
      }
      return response;
    }
    loadDashboard()
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setData(body.data);
      })
      .catch((error) => {
        if (/token|401/i.test(error.message || '')) {
          localStorage.removeItem('pos_access_token');
          localStorage.removeItem('pos_refresh_token');
          window.location.assign('/');
          return;
        }
        setMessage(error.message || 'Dasbor tidak dapat dimuat');
      });
  }, []);

  const isGudang = role === 'gudang';
  const summary = data?.owner_summary || data?.summary || {};
  const stock = data?.stock_summary;
  const peakSales = Math.max(1, ...(data?.sales_trend || []).map((item) => Number(item.sales)));
  const paymentTotal = Math.max(1, ...(data?.payment_breakdown || []).map((item) => Number(item.amount)));

  return <AppShell title="Dasbor" eyebrow={isGudang ? 'RINGKASAN GUDANG' : 'RINGKASAN TOKO'} actions={isGudang ? <a className="button-link" href="/inventory">Kelola Stok</a> : <><a className="button-link" href="/closing">Cetak Penutupan</a><a className="button-link" href="/pos">Buka Kasir <ArrowUpRight aria-hidden="true" size={15} /></a></>}>
    {message && <p className="message" role="status">{message}</p>}
    {!data ? <section className="panel"><p>Memuat ringkasan toko…</p></section> : isGudang ? (
      <>
        <section className="metrics-grid dashboard-metrics" aria-label="Ringkasan stok gudang">
          <article className="metric-card sales-metric"><span className="metric-icon"><Banknote aria-hidden="true" size={17} /></span><div><span>Total Produk</span><strong>{Number(stock?.total_products || 0).toLocaleString('id-ID')}</strong><small>Produk unik di semua gudang</small></div></article>
          <article className="metric-card sales-metric"><span className="metric-icon"><CalendarDays aria-hidden="true" size={17} /></span><div><span>Total Stok</span><strong>{Number(stock?.total_stock || 0).toLocaleString('id-ID')}</strong><small>Stok fisik seluruh gudang</small></div></article>
          <article className="metric-card sales-metric"><span className="metric-icon"><CreditCard aria-hidden="true" size={17} /></span><div><span>Stok Dialokasikan</span><strong>{Number(stock?.reserved_stock || 0).toLocaleString('id-ID')}</strong><small>Reserved / alokasi</small></div></article>
          <article className="metric-card expense-metric"><span className="metric-icon"><ReceiptText aria-hidden="true" size={17} /></span><div><span>Stok Habis</span><strong>{Number(stock?.out_of_stock || 0).toLocaleString('id-ID')}</strong><small>Produk dengan stok 0</small></div></article>
        </section>
        <section className="panel dashboard-recent">
          <div className="section-heading"><div><h2>Mutasi Stok Terbaru</h2><p>Aktivitas stok masuk/keluar gudang.</p></div><a href="/inventory/movements">Lihat semua</a></div>
          <div className="data-list">{(stock?.recent_mutations || []).map((m) => <article key={m.id}><div><strong>{m.product_name}</strong><span>{m.sku} · {new Date(m.created_at).toLocaleString('id-ID')}</span></div><div><strong className={Number(m.qty) >= 0 ? '' : ''}>{Number(m.qty) >= 0 ? '+' : ''}{m.qty}</strong><span className="tag">{m.channel || 'mutasi'}</span></div></article>)}</div>
          {(stock?.recent_mutations || []).length === 0 && <p>Belum ada mutasi stok.</p>}
        </section>
      </>
    ) : <>
      {data.owner_summary && <p className="dashboard-note"><Sparkles aria-hidden="true" size={15} /> Menampilkan gabungan seluruh toko.</p>}
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
        <section className="panel"><div className="section-heading"><div><h2>Metode pembayaran</h2><p>Komposisi pembayaran 30 hari terakhir.</p></div></div><div className="payment-bars">{data.payment_breakdown?.length ? data.payment_breakdown.map((item) => <div key={item.payment_method}><div><span>{item.payment_method.toUpperCase()}</span><strong>{rupiah(item.amount)}</strong></div><span className="payment-bar"><i style={{ width: Number(item.amount) / paymentTotal * 100 + '%' }} /></span></div>) : <p>Belum ada data pembayaran.</p>}</div></section>
      </section>
      {data.stores?.length > 1 && <section className="panel store-summary"><div className="section-heading"><div><h2>Ringkasan semua toko</h2><p>Perbandingan cabang untuk owner/admin utama.</p></div></div><div className="store-summary-grid">{data.stores.map((store) => <article key={store.id}><header><div><strong>{store.name}</strong><span>{store.address || 'Alamat belum diatur'}</span></div><b>{store.products} produk</b></header><dl><div><dt>Hari ini</dt><dd>{rupiah(store.today_sales)}</dd></div><div><dt>7 hari</dt><dd>{rupiah(store.seven_day_sales)}</dd></div><div><dt>Pengeluaran bulan ini</dt><dd>{rupiah(store.month_expenses)}</dd></div></dl></article>)}</div></section>}
      <section className="panel dashboard-recent"><div className="section-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan terakhir.</p></div><a href="/history">Lihat semua</a></div><div className="data-list">{data.recent_transactions.length ? data.recent_transactions.map((tx) => <article key={tx.id}><div><strong>{tx.invoice_no}</strong><span>{tx.cashier}{data.owner_summary ? ' · ' + tx.branch_name : ''} · {new Date(tx.created_at).toLocaleString('id-ID')}</span></div><div><strong>{rupiah(tx.grand_total)}</strong><span className="tag">{tx.payment_method}</span></div></article>) : <p>Belum ada transaksi.</p>}</div></section>
    </>}
  </AppShell>;
}
