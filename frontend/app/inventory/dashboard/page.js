'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';
import WarehouseDashboard from '../../dashboard/WarehouseDashboard';
import useDashboardRefresh from '../../dashboard/useDashboardRefresh';
import { getWarehousePeriodRange, WAREHOUSE_PERIOD_OPTIONS } from '../../dashboard/warehouse-periods.mjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const fullDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}/${year}` : '-'; };

async function requestJson(path, options) {
  let response = await fetch(`${api}${path}`, options);
  if (response.status === 401 && path.startsWith('/dashboard')) {
    const refresh = await fetch(`${api}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (refresh.ok) response = await fetch(`${api}${path}`, options);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Data tidak dapat dimuat.');
  return body;
}

export default function StockDashboardPage() {
  const { user, activeBranchId } = useAppSession();
  const [range, setRange] = useState({ start: '', end: '' });
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const role = user?.role || '';
  const refreshVersion = useDashboardRefresh(Boolean(role));

  useEffect(() => {
    const initialRange = getWarehousePeriodRange('today');
    setRange(initialRange);
    setDraftStart(initialRange.start);
    setDraftEnd(initialRange.end);
  }, []);

  useEffect(() => { setData(null); }, [role, activeBranchId, range]);

  // Tanggal diketik → terapkan otomatis setelah jeda singkat (tanpa tombol).
  useEffect(() => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return undefined;
    if (draftStart === range.start && draftEnd === range.end) return undefined;
    const timer = setTimeout(() => {
      setSelectedPeriod('custom');
      setRange({ start: draftStart, end: draftEnd });
    }, 350);
    return () => clearTimeout(timer);
  }, [draftStart, draftEnd, range.start, range.end]);

  const applyPeriod = (period) => {
    const nextRange = getWarehousePeriodRange(period);
    setSelectedPeriod(period);
    setRange(nextRange);
    setDraftStart(nextRange.start);
    setDraftEnd(nextRange.end);
  };

  useEffect(() => {
    if (!role || !range.start || !range.end) return undefined;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setMessage('');
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (role === 'owner' && activeBranchId) query.set('branch_id', activeBranchId);
      try {
        const body = await requestJson(`/dashboard?${query}`, { signal: controller.signal, cache: 'no-store' });
        if (!controller.signal.aborted) setData(body.data);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [role, activeBranchId, range, refreshVersion]);

  const dashboardKey = role === 'owner' ? 'owner_stock_dashboard' : 'warehouse_dashboard';
  const dashboardLabel = role === 'owner' && activeBranchId === 'all'
    ? 'Semua toko dan gudang'
    : 'Mengikuti toko/gudang aktif';

  return <AppShell title="Dashboard Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="warehouse-dashboard-toolbar stock-dashboard-toolbar">
      <div>
        <h2>{role === 'owner' ? dashboardLabel : 'Ringkasan stok cabang aktif'}</h2>
        <p className="muted">Periode {fullDate(range.start)} – {fullDate(range.end)}</p>
      </div>
      <div className="stock-dashboard-controls">
        <div className="warehouse-dashboard-periods stock-dashboard-periods" role="group" aria-label="Pilih periode dashboard stok">
          {WAREHOUSE_PERIOD_OPTIONS.map(({ key, label }) => (
            <button type="button" key={key} className="period-chip" aria-pressed={selectedPeriod === key} onClick={() => applyPeriod(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="warehouse-date-filter stock-dashboard-date-filter">
          <label>Dari<input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} /></label>
          <span>s/d</span>
          <label>Sampai<input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} /></label>
        </div>
      </div>
    </section>
    {message && <p className="message" role="alert">{message}</p>}
    {loading && !data ? <section className="panel"><p>Memuat dashboard stok…</p></section> : data ? <WarehouseDashboard data={data} dashboardKey={dashboardKey} start={range.start} end={range.end} canMutateStock={role === 'owner' || role === 'gudang'} /> : !message ? <section className="panel"><p>Menyiapkan dashboard stok…</p></section> : null}
    {loading && data && <p className="muted" role="status">Memperbarui data stok…</p>}
  </AppShell>;
}
