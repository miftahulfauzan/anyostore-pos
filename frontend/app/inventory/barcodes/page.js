'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import BarcodeLabel from '../../components/BarcodeLabel';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function BarcodePage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(keyword = '') {
    setLoading(true);
    try {
      const query = keyword.trim() ? '?search=' + encodeURIComponent(keyword.trim()) : '';
      const response = await fetch(api + '/inventory/barcode-items' + query, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Data barcode tidak dapat dimuat');
      setItems(body.data || []);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    load().catch(() => {});
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  const chosen = useMemo(() => items.flatMap((item) => Array.from({ length: Math.min(99, Number(selected[item.product_id + '-' + (item.variant_id || 0)]) || 0) }, () => item)), [items, selected]);
  function setCopies(item, value) {
    const key = item.product_id + '-' + (item.variant_id || 0);
    setSelected((current) => ({ ...current, [key]: Math.max(0, Math.min(99, Number(value) || 0)) }));
  }

  return <AppShell title="Cetak Barcode" eyebrow="PRODUK & INVENTORI" actions={<button type="button" onClick={() => window.print()} disabled={!chosen.length}>Cetak {chosen.length || ''} label</button>}>
    <section className="panel barcode-picker">
      <div className="section-heading"><div><h2>Pilih label produk</h2><p>Cetak barcode per produk atau warna. Barcode varian diprioritaskan, kemudian barcode/SKU produk.</p></div><span className="item-count">{chosen.length} label dipilih</span></div>
      <label className="catalog-search">Cari produk, SKU, barcode, atau warna<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contoh: A100 atau Denim" /></label>
      {message && <p className="message" role="status">{message}</p>}
      <div className="table-wrap"><table><thead><tr><th>Produk / warna</th><th>Nilai barcode</th><th>Harga</th><th>Jumlah label</th></tr></thead><tbody>{items.map((item) => {
        const key = item.product_id + '-' + (item.variant_id || 0);
        return <tr key={key}><td><strong>{item.name}</strong><small>{item.product_sku || 'Tanpa SKU'}{item.variant_color ? ' · ' + item.variant_color : ''}</small></td><td><code>{item.barcode_value}</code></td><td>Rp{Number(item.price || 0).toLocaleString('id-ID')}</td><td><input className="copies-input" aria-label={'Jumlah label ' + item.name + ' ' + (item.variant_color || '')} type="number" min="0" max="99" value={selected[key] || 0} onChange={(event) => setCopies(item, event.target.value)} /></td></tr>;
      })}{!loading && !items.length && <tr><td colSpan="4" className="empty-table">Tidak ada produk dengan SKU atau barcode.</td></tr>}</tbody></table></div>
    </section>
    <section className="barcode-print-area" aria-label="Pratinjau label barcode">{chosen.map((item, index) => <BarcodeLabel key={item.product_id + '-' + (item.variant_id || 0) + '-' + index} item={item} />)}</section>
  </AppShell>;
}
