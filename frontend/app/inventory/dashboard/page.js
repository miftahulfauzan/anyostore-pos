'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import WarehouseDashboard from '../../dashboard/WarehouseDashboard';

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
  const [role, setRole] = useState('');
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('all');
  const [range, setRange] = useState({ start: '', end: '' });
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const userBody = await requestJson('/auth/me');
        const currentRole = userBody.data?.role || '';
        if (!active) return;
        setRole(currentRole);
        if (currentRole === 'owner') {
          const branchBody = await requestJson('/settings/branches');
          if (!active) return;
          setBranches((branchBody.data || []).filter((item) => item.is_active === undefined || Boolean(Number(item.is_active))));
        }
        const end = localDate(new Date());
        const startDate = new Date(`${end}T00:00:00+07:00`);
        startDate.setDate(startDate.getDate() - 6);
        const start = localDate(startDate);
        setRange({ start, end });
        setDraftStart(start);
        setDraftEnd(end);
      } catch (error) {
        if (active) setMessage(error.message);
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!role || !range.start || !range.end) return undefined;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setMessage('');
      setData(null);
      const query = new URLSearchParams({ start: range.start, end: range.end });
      if (role === 'owner' && branch !== 'all') query.set('branch_id', branch);
      try {
        const body = await requestJson(`/dashboard?${query}`, { signal: controller.signal });
        setData(body.data);
      } catch (error) {
        if (error.name !== 'AbortError') setMessage(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [role, branch, range]);

  const dashboardKey = role === 'owner' ? 'owner_stock_dashboard' : 'warehouse_dashboard';
  const selectedBranch = branches.find((item) => String(item.id) === String(branch));
  const dashboardLabel = role === 'owner' && branch !== 'all'
    ? `${selectedBranch?.type === 'gudang' ? 'Gudang' : 'Toko'} · ${selectedBranch?.name || 'terpilih'}`
    : 'Semua toko dan gudang';

  return <AppShell title="Dashboard Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="warehouse-dashboard-toolbar stock-dashboard-toolbar">
      <div>
        <h2>{role === 'owner' ? dashboardLabel : 'Ringkasan stok cabang aktif'}</h2>
        <p className="muted">Periode {fullDate(range.start)} – {fullDate(range.end)}</p>
      </div>
      <div className="stock-dashboard-controls">
        {role === 'owner' && <label className="stock-dashboard-branch">Toko / gudang
          <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Pilih toko atau gudang untuk dashboard stok">
            <option value="all">Semua toko dan gudang</option>
            {branches.map((item) => <option key={item.id} value={item.id}>{item.type === 'gudang' ? 'Gudang' : 'Toko'} · {item.name}</option>)}
          </select>
        </label>}
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
