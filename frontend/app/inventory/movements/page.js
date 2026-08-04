'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import DateRangePresets from '../../components/DateRangePresets';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const typeLabels = { sale: 'Penjualan', purchase: 'Produk masuk', adjustment: 'Penyesuaian', transfer_in: 'Transfer masuk', transfer_out: 'Transfer keluar', sale_return: 'Retur penjualan', damage: 'Barang rusak', loss: 'Kehilangan', gift: 'Hadiah' };

export default function StockMovementsPage() {
  const [rows, setRows] = useState([]);
  const [channels, setChannels] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', type: '' });
  const [preset, setPreset] = useState('');
  const [selected, setSelected] = useState(null);
  const loadSeq = useRef(0);
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(activeFilters = filters) {
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const query = new URLSearchParams({ limit: '100' });
      Object.entries(activeFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      const response = await fetch(api + '/inventory/mutations?' + query, { headers: headers() });
      const body = await response.json();
      if (seq !== loadSeq.current) return;
      if (!response.ok) throw new Error(body.message || 'Riwayat stok tidak dapat dimuat');
      setRows(body.data || []);
    } catch (error) { if (seq === loadSeq.current) setMessage(error.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    load().catch(() => {});
    fetch(api + '/inventory/channels', { headers: headers() })
      .then((r) => r.json())
      .then((b) => { if (b?.data) setChannels(Object.fromEntries(b.data.map((c) => [c.value, c.name]))); })
      .catch(() => {});
  }, []);

  function apply(event) {
    event.preventDefault();
    setMessage('');
    load().catch(() => {});
  }

  return <AppShell title="Riwayat Pergerakan Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="panel movement-filter">
      <div><h2>Jejak audit stok</h2><p className="muted">Setiap stok masuk, keluar, transaksi, retur, transfer, dan opname tercatat bersama petugas serta saldo sebelum/sesudah.</p></div>
      <form onSubmit={apply}>
        <DateRangePresets active={preset} onPick={(key, range) => {
          setPreset(key);
          if (range) {
            const next = { ...filters, date_from: range.start, date_to: range.end };
            setFilters(next);
            load(next);
          }
        }} />
        <label>Dari tanggal<input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /></label>
        <label>Sampai tanggal<input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /></label>
        <label>Jenis perubahan<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Semua aktivitas</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" disabled={loading}>{loading ? 'Memuat…' : 'Terapkan filter'}</button>
      </form>
    </section>
    {message && <p className="message records" role="status">{message}</p>}

    <div style={{ display: 'grid', gap: '.75rem', maxWidth: 1400, margin: '0 auto' }}>
      {loading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="panel" style={{ height: 80, borderRadius: 10, background: '#f1f5f9' }} />)}
      {!loading && rows.map((row) => (
        <article key={row.id} className="panel movement-card" onClick={() => setSelected(selected?.id === row.id ? null : row)} style={{ cursor: 'pointer', borderRadius: 10, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start', borderLeft: row.qty >= 0 ? '3px solid #16a34a' : '3px solid #dc2626' }}>
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{row.product_name}</strong>
              <span className={`mutation-type ${row.qty >= 0 ? 'increase' : 'decrease'}`} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: row.qty >= 0 ? '#dcfce7' : '#fef2f2', color: row.qty >= 0 ? '#16a34a' : '#dc2626' }}>{typeLabels[row.type] || row.type}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {row.product_sku || ''}{row.variant_color ? ` · ${row.variant_color}` : ''} • {new Date(row.created_at).toLocaleString('id-ID')}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              {row.user_name || 'Sistem'}{row.channel ? ` · ${channels[row.channel] || row.channel}` : ''}{row.notes ? ` · ${row.notes}` : ''}{row.warehouse_name ? ` · ${row.warehouse_name}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: row.qty >= 0 ? '#16a34a' : '#dc2626' }}>{row.qty >= 0 ? '+' : ''}{row.qty}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.stock_before ?? '—'} → {row.stock_after ?? '—'}</div>
          </div>
        </article>
      ))}
      {!loading && !rows.length && <div className="panel" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Belum ada riwayat stok untuk filter ini.</div>}
    </div>
  </AppShell>;
}
