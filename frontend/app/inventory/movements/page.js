'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const typeLabels = { sale: 'Penjualan', purchase: 'Produk masuk', adjustment: 'Penyesuaian', transfer_in: 'Transfer masuk', transfer_out: 'Transfer keluar', sale_return: 'Retur penjualan', damage: 'Barang rusak', loss: 'Kehilangan', gift: 'Hadiah' };

export default function StockMovementsPage() {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', type: '' });
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(activeFilters = filters) {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '100' });
      Object.entries(activeFilters).forEach(([key, value]) => { if (value) query.set(key, value); });
      const response = await fetch(api + '/inventory/mutations?' + query, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Riwayat stok tidak dapat dimuat');
      setRows(body.data || []);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    load().catch(() => {});
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
        <label>Dari tanggal<input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /></label>
        <label>Sampai tanggal<input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /></label>
        <label>Jenis perubahan<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Semua aktivitas</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" disabled={loading}>{loading ? 'Memuat…' : 'Terapkan filter'}</button>
      </form>
    </section>
    {message && <p className="message records" role="status">{message}</p>}
    <section className="panel records">
      <div className="section-heading"><div><h2>Aktivitas terbaru</h2><p>{rows.length} catatan ditampilkan</p></div></div>
      <div className="table-wrap"><table className="movement-table"><thead><tr><th>Waktu</th><th>Produk</th><th>Aktivitas</th><th>Perubahan</th><th>Stok</th><th>Petugas</th><th>Catatan</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td><strong>{new Date(row.created_at).toLocaleDateString('id-ID')}</strong><small>{new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · {row.warehouse_name || row.branch_name}</small></td>
          <td><strong>{row.product_name}</strong><small>{row.product_sku || 'Tanpa SKU'}{row.variant_color ? ' · ' + row.variant_color : ''}</small></td>
          <td><span className={'mutation-type ' + (row.qty >= 0 ? 'increase' : 'decrease')}>{typeLabels[row.type] || row.type}</span><small>{row.reference_type?.replaceAll('_', ' ') || 'Manual'}</small></td>
          <td className={row.qty >= 0 ? 'stock-increase' : 'stock-decrease'}>{row.qty >= 0 ? '+' : ''}{row.qty}</td>
          <td><strong>{row.stock_before ?? '—'} → {row.stock_after ?? '—'}</strong></td><td>{row.user_name || 'Sistem'}</td><td>{row.notes || '—'}</td>
        </tr>)}
        {!loading && !rows.length && <tr><td colSpan="7" className="empty-table">Belum ada riwayat stok untuk filter ini.</td></tr>}
      </tbody></table></div>
    </section>
  </AppShell>;
}
