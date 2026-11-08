'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Store } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import { createRequestSequence } from '../components/app-state.cjs';
import WarehouseDashboard from './WarehouseDashboard';
import OlseraDashboardSections from './OlseraDashboardSections';
import useDashboardRefresh from './useDashboardRefresh';
import { getWarehousePeriodRange, WAREHOUSE_PERIOD_OPTIONS } from './warehouse-periods.mjs';
import { labelFor, paymentLabels } from '../lib/ui-labels';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const fullDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}/${year}` : '-'; };
const transactionDateTime = (transaction) => `${fullDate(transaction.transaction_date)}${transaction.created_at ? `, ${new Date(transaction.created_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}` : ''}`;

export default function DashboardPage() {
  const router = useRouter();
  const { user, activeBranchId } = useAppSession();
  const [data, setData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [message, setMessage] = useState('');
  const [range, setRange] = useState({ start: '', end: '' });
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const dashboardLoadSequence = useRef(createRequestSequence());
  const refreshVersion = useDashboardRefresh(user?.role === 'gudang');
  const [selectedPeriod, setSelectedPeriod] = useState('last7');

  useEffect(() => {
    const initialRange = getWarehousePeriodRange('last7');
    setRange(initialRange);
    setDraftStart(initialRange.start);
    setDraftEnd(initialRange.end);
  }, []);

  useEffect(() => { setData(null); setReportData(null); }, [range, activeBranchId, user?.role]);

  const applyPeriod = (period) => {
    const nextRange = getWarehousePeriodRange(period);
    setSelectedPeriod(period);
    setRange(nextRange);
    setDraftStart(nextRange.start);
    setDraftEnd(nextRange.end);
  };

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return;
    setSelectedPeriod('custom');
    setRange({ start: draftStart, end: draftEnd });
  };

  useEffect(() => {
    if (!range.start || !range.end) return undefined;
    const requestId = dashboardLoadSequence.current.next();
    setMessage('');
    async function loadDashboard() {
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (user?.role === 'owner' && activeBranchId && activeBranchId !== 'all') query.set('branch_id', activeBranchId);
      const fetchWithRefresh = async (path) => {
        let response = await fetch(apiUrl + path, { cache: 'no-store' });
        if (response.status !== 401) return response;
        const refreshResponse = await fetch(apiUrl + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (refreshResponse.ok) {
          response = await fetch(apiUrl + path, { cache: 'no-store' });
        }
        return response;
      };
      const dashboardResponse = await fetchWithRefresh('/dashboard?' + query);
      const dashboardBody = await dashboardResponse.json();
      if (!dashboardResponse.ok) throw new Error(dashboardBody.message);
      if (user?.role === 'gudang' || user?.role === 'kasir') return { data: dashboardBody.data, report: null };
      const reportResponse = await fetchWithRefresh('/reports/overview?' + query);
      const reportBody = await reportResponse.json();
      if (!reportResponse.ok) throw new Error(reportBody.message);
      return { data: dashboardBody.data, report: reportBody.data };
    }
    loadDashboard()
      .then(async ({ data: dashboardData, report }) => {
        if (!dashboardLoadSequence.current.isCurrent(requestId)) return;
        setData(dashboardData);
        setReportData(report);
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
  }, [range, activeBranchId, user?.role, refreshVersion]);

  const role = user?.role || null;
  const isGudang = role === 'gudang';
  const selectedSummary = data?.selected_summary || data?.summary || {};
  const selectedTrend = data?.selected_sales_trend || data?.sales_trend || [];
  const selectedPayments = data?.selected_payment_breakdown || data?.payment_breakdown || [];
  const selectedRecent = data?.selected_recent_transactions || data?.recent_transactions || [];
  const selectedStores = data?.selected_stores || data?.stores || [];
  const selectedPeriodRange = data?.selected_period || range;
  const cashierPeakSales = Math.max(1, ...selectedTrend.map((item) => Number(item.sales)));

  return <AppShell title="Dasbor" eyebrow={isGudang ? 'RINGKASAN GUDANG' : 'RINGKASAN TOKO'} actions={isGudang ? <><Link className="button-link" href="/inventory">Kelola Stok</Link><a className="button-link" href="/" target="_blank" rel="noopener noreferrer">Landing Page</a></> : <><a className="button-link" href="/" target="_blank" rel="noopener noreferrer">Landing Page</a><Link className="button-link" href="/closing">Cetak Penutupan</Link><Link className="button-link" href="/pos">Buka Kasir <ArrowUpRight aria-hidden="true" size={15} /></Link></>}>
    {message && <p className="message" role="status">{message}</p>}
    {!data ? <section className="panel"><p>Memuat ringkasan toko…</p></section> : isGudang ? (
      <>
        <section className="warehouse-dashboard-toolbar">
          <div>
            <span className="eyebrow">DASHBOARD GUDANG</span>
            <h2>Periode {fullDate(range.start)} – {fullDate(range.end)}</h2>
          </div>
          <div className="warehouse-dashboard-range-controls">
            <div className="warehouse-dashboard-periods" role="group" aria-label="Pilih periode dashboard gudang">
              {WAREHOUSE_PERIOD_OPTIONS.map(({ key, label }) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={selectedPeriod === key}
                  onClick={() => applyPeriod(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="warehouse-date-filter">
              <label>Dari<input type="date" value={draftStart} onChange={(event) => { setDraftStart(event.target.value); setSelectedPeriod('custom'); }} /></label>
              <span>s/d</span>
              <label>Sampai<input type="date" value={draftEnd} onChange={(event) => { setDraftEnd(event.target.value); setSelectedPeriod('custom'); }} /></label>
              <button type="button" onClick={applyCustomRange} disabled={!draftStart || !draftEnd || draftStart > draftEnd}>Terapkan</button>
            </div>
          </div>
        </section>
        <WarehouseDashboard data={data} start={range.start} end={range.end} canMutateStock={isGudang} />
      </>
    ) : role === 'kasir' ? <>
      <section className="dashboard-report-layout">
        <section className="panel dashboard-report-section report-tone-blue">
          <div className="section-heading dashboard-report-heading"><div><h2>Penjualan</h2><p>Ringkasan kasir sesuai periode yang dipilih.</p></div></div>
          <div className="dashboard-report-focal"><span>Penjualan periode</span><strong>{rupiah(selectedSummary.sales)}</strong><small>{selectedSummary.transactions || 0} transaksi selesai</small></div>
          <div className="dashboard-report-row"><span>Produk terjual</span><strong>{selectedSummary.products_sold || 0} pcs</strong></div>
          <div className="dashboard-report-row"><span>Pengeluaran</span><strong>{rupiah(selectedSummary.expenses)}</strong></div>
          <div className="dashboard-report-row"><span>Pembayaran</span><strong>{selectedPayments.map((item) => `${labelFor(paymentLabels, item.payment_method)} ${rupiah(item.amount)}`).join(' · ') || '-'}</strong></div>
        </section>
        <section className="panel dashboard-report-section report-tone-blue">
          <div className="section-heading dashboard-report-heading"><div><h2>Tren penjualan</h2><p>Penjualan harian dari periode yang dipilih.</p></div></div>
          <div className="bar-chart">{selectedTrend.map((item) => <div className="bar-column" key={item.date}><strong>{rupiah(item.sales)}</strong><span className="bar" style={{ height: Math.max(8, Number(item.sales) / cashierPeakSales * 150) + 'px' }} /><small>{item.label}</small></div>)}</div>
        </section>
      </section>
      <section className="panel dashboard-recent"><div className="section-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan pada periode terpilih.</p></div><Link href="/history">Lihat semua</Link></div><div className="data-list">{selectedRecent.length ? selectedRecent.map((tx) => <article key={tx.id}><div><strong>{tx.invoice_no}</strong><span>{tx.cashier} · {transactionDateTime(tx)}</span></div><div><strong>{rupiah(tx.grand_total)}</strong><span className="tag">{labelFor(paymentLabels, tx.payment_method)}</span></div></article>) : <p>Belum ada transaksi.</p>}</div></section>
    </> : <>
      {role === 'owner' && activeBranchId === 'all' && <p className="dashboard-note"><Store aria-hidden="true" size={15} /> Menampilkan gabungan seluruh toko/gudang.</p>}
      <section className="dashboard-report-toolbar">
        <div>
          <span className="eyebrow">DASHBOARD PENJUALAN</span>
          <h2>Periode {fullDate(selectedPeriodRange.start)} – {fullDate(selectedPeriodRange.end)}</h2>
          {reportData?.branch_name && <p>{reportData.branch_name}</p>}
        </div>
        <div className="dashboard-report-range-controls">
          <div className="dashboard-report-periods" role="group" aria-label="Pilih periode dashboard penjualan">
            {WAREHOUSE_PERIOD_OPTIONS.map(({ key, label }) => (
              <button type="button" key={key} aria-pressed={selectedPeriod === key} onClick={() => applyPeriod(key)}>{label}</button>
            ))}
          </div>
          <div className="dashboard-report-date-filter">
            <label>Dari<input type="date" value={draftStart} onChange={(event) => { setDraftStart(event.target.value); setSelectedPeriod('custom'); }} /></label>
            <span>s/d</span>
            <label>Sampai<input type="date" value={draftEnd} onChange={(event) => { setDraftEnd(event.target.value); setSelectedPeriod('custom'); }} /></label>
            <button type="button" onClick={applyCustomRange} disabled={!draftStart || !draftEnd || draftStart > draftEnd}>Terapkan</button>
          </div>
        </div>
      </section>
      <OlseraDashboardSections reportData={reportData} fallbackData={data} />
          {role === 'owner' && activeBranchId === 'all' && selectedStores.length > 1 && <section className="panel store-summary"><div className="section-heading"><div><h2>Ringkasan semua toko</h2><p>Perbandingan cabang untuk periode terpilih.</p></div></div><div className="store-summary-grid">{selectedStores.map((store) => <article key={store.id}><header><div><strong>{store.name}</strong><span>{store.address || 'Alamat belum diatur'}</span></div><b>{store.products} produk</b></header><dl><div><dt>Penjualan periode</dt><dd>{rupiah(store.selected_sales)}</dd></div><div><dt>Transaksi periode</dt><dd>{store.selected_transactions || 0}</dd></div><div><dt>Pengeluaran periode</dt><dd>{rupiah(store.selected_expenses)}</dd></div></dl></article>)}</div></section>}
          <section className="panel dashboard-recent"><div className="section-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan pada periode terpilih.</p></div><Link href="/history">Lihat semua</Link></div><div className="data-list">{selectedRecent.length ? selectedRecent.map((tx) => <article key={tx.id}><div><strong>{tx.invoice_no}</strong><span>{tx.cashier}{data.owner_summary ? ' · ' + tx.branch_name : ''} · {transactionDateTime(tx)}</span></div><div><strong>{rupiah(tx.grand_total)}</strong><span className="tag">{labelFor(paymentLabels, tx.payment_method)}</span></div></article>) : <p>Belum ada transaksi.</p>}</div></section>
    </>}
  </AppShell>;
}
