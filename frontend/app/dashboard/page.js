'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowDownToLine, ArrowRightLeft, ArrowUp, ArrowUpFromLine, ArrowUpRight, Banknote, Boxes, CalendarDays, ChartNoAxesCombined, ClipboardCheck, CreditCard, Package, ReceiptText, Sparkles, TriangleAlert } from 'lucide-react';
import AppShell from '../components/AppShell';
import { labelFor, paymentLabels } from '../lib/ui-labels';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const localDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const shortDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}` : '—'; };
const fullDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}/${year}` : '—'; };

function dateRangeDays(start, end, daily) {
  const byDate = new Map((daily || []).map((item) => [String(item.date).slice(0, 10), item]));
  if (!start || !end) return daily || [];
  const rows = [];
  const cursor = new Date(`${start}T00:00:00+07:00`);
  const last = new Date(`${end}T00:00:00+07:00`);
  for (let index = 0; cursor <= last && index < 62; index += 1) {
    const key = localDate(cursor);
    rows.push({ date: key, in: Number(byDate.get(key)?.in || 0), out: Number(byDate.get(key)?.out || 0) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function WarehouseTrend({ daily }) {
  const max = Math.max(1, ...(daily || []).flatMap((item) => [Number(item.in || 0), Number(item.out || 0)]));
  const width = 760;
  const height = 210;
  const chartTop = 16;
  const chartBottom = 170;
  const point = (value, index) => `${daily.length > 1 ? (index / (daily.length - 1)) * width : width / 2},${chartBottom - (Number(value || 0) / max) * (chartBottom - chartTop)}`;
  const inPoints = (daily || []).map((item, index) => point(item.in, index)).join(' ');
  const outPoints = (daily || []).map((item, index) => point(item.out, index)).join(' ');
  return <div className="warehouse-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik stok masuk dan keluar">
      {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={chartTop + line * 51} y2={chartTop + line * 51} className="trend-grid-line" />)}
      <polyline points={inPoints} className="trend-line trend-in" />
      <polyline points={outPoints} className="trend-line trend-out" />
      {(daily || []).map((item, index) => <g key={item.date}><circle cx={point(item.in, index).split(',')[0]} cy={point(item.in, index).split(',')[1]} r="4" className="trend-dot trend-in" /><circle cx={point(item.out, index).split(',')[0]} cy={point(item.out, index).split(',')[1]} r="4" className="trend-dot trend-out" /></g>)}
    </svg>
    <div className="trend-labels">{(daily || []).map((item) => <span key={item.date}>{shortDate(item.date)}</span>)}</div>
    <div className="trend-legend"><span><i className="legend-in" />Stok Masuk</span><span><i className="legend-out" />Stok Keluar</span></div>
  </div>;
}

function WarehouseDashboard({ data, start, end }) {
  const dashboard = data?.warehouse_dashboard || {};
  const summary = dashboard.summary || {};
  const daily = useMemo(() => dateRangeDays(start, end, dashboard.daily), [start, end, dashboard.daily]);
  const totalStatus = Number(summary.safe_stock || 0) + Number(summary.low_stock || 0) + Number(summary.out_of_stock || 0);
  const hasStatusData = totalStatus > 0;
  const safePercent = hasStatusData ? Math.round(Number(summary.safe_stock || 0) / totalStatus * 100) : 0;
  const lowPercent = hasStatusData ? Math.round(Number(summary.low_stock || 0) / totalStatus * 100) : 0;
  const emptyPercent = hasStatusData ? Math.max(0, 100 - safePercent - lowPercent) : 0;
  const maxCategory = Math.max(1, ...(dashboard.categories || []).map((item) => Number(item.total || 0)));
  const maxOut = Math.max(1, ...(dashboard.top_products_out || []).map((item) => Number(item.total || 0)));
  const actionItems = [
    { href: '/inventory/incoming', label: 'Stock Masuk', icon: ArrowDownToLine, tone: 'green' },
    { href: '/inventory/outgoing', label: 'Stock Keluar', icon: ArrowUpFromLine, tone: 'red' },
    { href: '/inventory/opname', label: 'Opname', icon: ClipboardCheck, tone: 'cyan' },
    { href: '/inventory/transfers', label: 'Transfer', icon: ArrowRightLeft, tone: 'blue' },
    { href: '/products', label: 'Master Produk', icon: Package, tone: 'purple' },
    { href: '/inventory/mutation-report', label: 'Laporan', icon: ChartNoAxesCombined, tone: 'blue' },
  ];
  return <div className="warehouse-dashboard">
    <section className="warehouse-stat-grid" aria-label="Ringkasan stok gudang">
      <article className="warehouse-stat stat-blue"><span className="warehouse-stat-icon"><Package size={16} /></span><span>Total SKU</span><strong>{Number(summary.total_sku || 0).toLocaleString('id-ID')}</strong><small>Produk aktif</small></article>
      <article className="warehouse-stat stat-sky"><span className="warehouse-stat-icon"><Boxes aria-hidden="true" size={16} /></span><span>Total Stok</span><strong>{Number(summary.total_stock || 0).toLocaleString('id-ID')}</strong><small>Rata-rata {summary.total_sku ? Math.round(Number(summary.total_stock || 0) / Number(summary.total_sku)) : 0} / SKU</small></article>
      <article className="warehouse-stat stat-amber"><span className="warehouse-stat-icon"><TriangleAlert size={16} /></span><span>Hampir Habis</span><strong>{Number(summary.low_stock || 0).toLocaleString('id-ID')}</strong><small>SKU perlu dipantau</small></article>
      <article className="warehouse-stat stat-red"><span className="warehouse-stat-icon"><TriangleAlert size={16} /></span><span>Stok Kosong</span><strong>{Number(summary.out_of_stock || 0).toLocaleString('id-ID')}</strong><small>SKU tanpa stok</small></article>
    </section>

    <section className="panel warehouse-summary-panel">
      <div className="warehouse-panel-heading"><div><h2>Ringkasan</h2><p>{fullDate(start)} s/d {fullDate(end)}</p></div><span className="warehouse-range-note">Masuk {daily.reduce((sum, item) => sum + Number(item.in || 0), 0).toLocaleString('id-ID')} · Keluar {daily.reduce((sum, item) => sum + Number(item.out || 0), 0).toLocaleString('id-ID')}</span></div>
      <div className="warehouse-summary-triplet"><div><span className="summary-in"><ArrowDown aria-hidden="true" size={13} /> Masuk</span><strong>{daily.reduce((sum, item) => sum + Number(item.in || 0), 0).toLocaleString('id-ID')}</strong></div><div><span className="summary-out"><ArrowUp aria-hidden="true" size={13} /> Keluar</span><strong>{daily.reduce((sum, item) => sum + Number(item.out || 0), 0).toLocaleString('id-ID')}</strong></div><div><span className="summary-net"><ArrowRightLeft aria-hidden="true" size={13} /> Selisih</span><strong>{(daily.reduce((sum, item) => sum + Number(item.in || 0) - Number(item.out || 0), 0)).toLocaleString('id-ID')}</strong></div></div>
    </section>

    <section className="warehouse-chart-grid">
      <section className="panel"><div className="warehouse-panel-heading"><div><h2>Pergerakan Stok 7 Hari</h2><p>Mutasi aktual pada gudang aktif.</p></div></div><WarehouseTrend daily={daily} /></section>
      <section className="panel warehouse-status-panel"><div className="warehouse-panel-heading"><div><h2>Status Stok</h2><p>Kondisi SKU saat ini.</p></div></div>{hasStatusData ? <><div className="stock-donut" style={{ background: `conic-gradient(#2563eb 0 ${safePercent}%, #f59e0b ${safePercent}% ${safePercent + lowPercent}%, #ef4444 ${safePercent + lowPercent}% 100%)` }}><div><strong>{Number(summary.total_sku || 0).toLocaleString('id-ID')}</strong><span>SKU</span></div></div><div className="stock-status-legend"><span><i className="status-safe" />Aman <b>{safePercent}%</b></span><span><i className="status-low" />Hampir habis <b>{lowPercent}%</b></span><span><i className="status-empty" />Kosong <b>{emptyPercent}%</b></span></div></> : <div className="stock-donut-empty" role="status"><strong>Belum ada data stok</strong><span>Data status akan muncul setelah ada SKU.</span></div>}</section>
    </section>

    <section className="warehouse-chart-grid warehouse-chart-grid-bottom"><section className="panel"><div className="warehouse-panel-heading"><div><h2>Stok per Kategori</h2><p>Total stok produk aktif.</p></div></div><div className="warehouse-bars">{(dashboard.categories || []).map((item) => <div className="warehouse-bar-row" key={item.name}><span>{item.name}</span><div><i style={{ width: `${Number(item.total || 0) / maxCategory * 100}%` }} /></div><strong>{Number(item.total || 0).toLocaleString('id-ID')}</strong></div>)}</div>{!dashboard.categories?.length && <p className="muted">Belum ada data kategori.</p>}</section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Top Produk Keluar</h2><p>Periode yang dipilih.</p></div></div><div className="warehouse-bars out-bars">{(dashboard.top_products_out || []).map((item) => <div className="warehouse-bar-row" key={item.sku}><span title={item.sku || item.name}>{item.name || item.sku}</span><div><i style={{ width: `${Number(item.total || 0) / maxOut * 100}%` }} /></div><strong>{Number(item.total || 0).toLocaleString('id-ID')}</strong></div>)}</div>{!dashboard.top_products_out?.length && <p className="muted">Belum ada data keluar.</p>}</section></section>

    <section className="warehouse-lower-grid"><section className="panel"><div className="warehouse-panel-heading"><div><h2>Aksi Cepat</h2><p>Akses pekerjaan gudang yang sering dipakai.</p></div></div><div className="warehouse-action-grid">{actionItems.map((item) => { const Icon = item.icon; return <a key={item.href} href={item.href} className={`warehouse-action tone-${item.tone}`}><Icon size={16} /><span>{item.label}</span></a>; })}</div></section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Baru Masuk</h2><p>Produk dengan penerimaan terbaru.</p></div><a href="/inventory/mutation-report">Lihat semua</a></div><div className="warehouse-list">{(dashboard.recent_incoming || []).map((item) => <div key={item.sku}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-positive">+{Number(item.quantity || 0).toLocaleString('id-ID')}</b></div>)}</div>{!dashboard.recent_incoming?.length && <p className="muted">Belum ada penerimaan pada periode ini.</p>}</section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Stok Menipis</h2><p>Prioritas pengadaan berikutnya.</p></div><a href="/inventory">Lihat stok</a></div><div className="warehouse-list">{(dashboard.low_stock || []).map((item) => <div key={item.sku}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-warning">{Number(item.total_stock || 0).toLocaleString('id-ID')}</b></div>)}{(dashboard.out_of_stock || []).slice(0, 3).map((item) => <div key={`empty-${item.sku}`}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-danger">0</b></div>)}</div>{!dashboard.low_stock?.length && !dashboard.out_of_stock?.length && <p className="muted">Semua stok aman.</p>}</section></section>
  </div>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' });
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  useEffect(() => {
    /* sesi via httpOnly cookie */
    fetch(apiUrl + '/auth/me', { headers: {} })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role) setRole(b.data.role); })
      .catch(() => {});
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
    async function loadDashboard() {
      const query = new URLSearchParams({ start: range.start, end: range.end });
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
        if (!response.ok) throw new Error(body.message);
        setData(body.data);
      })
      .catch((error) => {
        if (/token|401/i.test(error.message || '')) {
          localStorage.removeItem('pos_access_token');
          localStorage.removeItem('pos_refresh_token');
          router.replace('/');
          return;
        }
        setMessage(error.message || 'Dasbor tidak dapat dimuat');
      });
    return undefined;
  }, [range]);

  const isGudang = role === 'gudang' || Boolean(data?.warehouse_dashboard);
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
        <section className="panel"><div className="section-heading"><div><h2>Metode pembayaran</h2><p>Komposisi pembayaran 30 hari terakhir.</p></div></div><div className="payment-bars">{data.payment_breakdown?.length ? data.payment_breakdown.map((item) => <div key={item.payment_method}><div><span>{labelFor(paymentLabels, item.payment_method)}</span><strong>{rupiah(item.amount)}</strong></div><span className="payment-bar"><i style={{ width: Number(item.amount) / paymentTotal * 100 + '%' }} /></span></div>) : <p>Belum ada data pembayaran.</p>}</div></section>
      </section>
      {data.stores?.length > 1 && <section className="panel store-summary"><div className="section-heading"><div><h2>Ringkasan semua toko</h2><p>Perbandingan cabang untuk owner/admin utama.</p></div></div><div className="store-summary-grid">{data.stores.map((store) => <article key={store.id}><header><div><strong>{store.name}</strong><span>{store.address || 'Alamat belum diatur'}</span></div><b>{store.products} produk</b></header><dl><div><dt>Hari ini</dt><dd>{rupiah(store.today_sales)}</dd></div><div><dt>7 hari</dt><dd>{rupiah(store.seven_day_sales)}</dd></div><div><dt>Pengeluaran bulan ini</dt><dd>{rupiah(store.month_expenses)}</dd></div></dl></article>)}</div></section>}
      <section className="panel dashboard-recent"><div className="section-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan terakhir.</p></div><Link href="/history">Lihat semua</Link></div><div className="data-list">{data.recent_transactions.length ? data.recent_transactions.map((tx) => <article key={tx.id}><div><strong>{tx.invoice_no}</strong><span>{tx.cashier}{data.owner_summary ? ' · ' + tx.branch_name : ''} · {new Date(tx.created_at).toLocaleString('id-ID')}</span></div><div><strong>{rupiah(tx.grand_total)}</strong><span className="tag">{labelFor(paymentLabels, tx.payment_method)}</span></div></article>) : <p>Belum ada transaksi.</p>}</div></section>
    </>}
  </AppShell>;
}
