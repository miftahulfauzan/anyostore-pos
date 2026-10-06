'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';
import WarehouseDashboard from '../../dashboard/WarehouseDashboard';
import useDashboardRefresh from '../../dashboard/useDashboardRefresh';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const localDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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
  const role = user?.role || '';
  const refreshVersion = useDashboardRefresh(Boolean(role));

  useEffect(() => {
    const end = localDate(new Date());
    const startDate = new Date(`${end}T00:00:00+07:00`);
    startDate.setDate(startDate.getDate() - 6);
    const start = localDate(startDate);
    setRange({ start, end });
    setDraftStart(start);
    setDraftEnd(end);
  }, []);

  useEffect(() => { setData(null); }, [role, activeBranchId, range]);

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
        <div className="warehouse-date-filter">
          <label>Dari<input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} /></label>
          <span>s/d</span>
          <label>Sampai<input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} /></label>
          <button type="button" onClick={() => setRange({ start: draftStart, end: draftEnd })} disabled={!draftStart || !draftEnd || draftStart > draftEnd}>Terapkan</button>
        </div>
      </div>
    </section>
    {message && <p className="message" role="alert">{message}</p>}
    {loading && !data ? <section className="panel"><p>Memuat dashboard stok…</p></section> : data ? <WarehouseDashboard data={data} dashboardKey={dashboardKey} start={range.start} end={range.end} /> : !message ? <section className="panel"><p>Menyiapkan dashboard stok…</p></section> : null}
    {loading && data && <p className="muted" role="status">Memperbarui data stok…</p>}
  </AppShell>;
}
