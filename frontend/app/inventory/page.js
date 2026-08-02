'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import StockReportSection from './stock-view';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const TYPE_LABEL = { utama: 'Gudang Utama', cadangan: 'Gudang Cadangan', reject: 'Gudang Reject' };

export default function InventoryPage() {
  const [tab, setTab] = useState('stok');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [stock, setStock] = useState([]);
  const [message, setMessage] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', type: 'utama', description: '' });
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(id) {
    if (!id) return;
    const wh = warehouses.find((w) => String(w.id) === String(id));
    const q = wh && wh.branch_id ? `?warehouse_id=${id}&branch_id=${wh.branch_id}` : `?warehouse_id=${id}`;
    const response = await fetch(api + '/inventory/stock' + q, { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setStock(body.data);
  }
  async function loadWarehouses() {
    const response = await fetch(api + '/inventory/warehouses/all', { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setWarehouses(body.data);
    const first = String(body.data[0]?.id || '');
    setWarehouse(first);
    if (first) load(first).catch((error) => setMessage(error.message));
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/auth/me', { headers: headers() })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); if (['owner', 'manager', 'admin'].includes(b?.data?.role)) setCanManage(true); })
      .catch(() => {});
    fetch(api + '/inventory/warehouses/all', { headers: headers() }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setWarehouses(body.data);
      const id = String(body.data[0]?.id || '');
      setWarehouse(id);
      if (id) load(id).catch((error) => setMessage(error.message));
    }).catch((error) => setMessage(error.message));
  }, []);

  const products = useMemo(() => {
    const grouped = new Map();
    stock.forEach((item) => {
      const current = grouped.get(item.product_id) || { id: item.product_id, name: item.name, sku: item.sku, standardStock: null, variants: [] };
      if (item.variant_id) current.variants.push(item);
      else current.standardStock = item;
      grouped.set(item.product_id, current);
    });
    return Array.from(grouped.values());
  }, [stock]);

  return <AppShell title="Stok Produk" eyebrow="PRODUK & INVENTORI" actions={<><a className="button-link" href="/inventory/transfers">Transfer Stok</a><a className="button-link" href="/inventory/opname">Stok Opname</a></>}>
    <div className="tabs">
      <button type="button" className={tab === 'stok' ? 'active' : ''} onClick={() => setTab('stok')}>Stok Gudang</button>
      <button type="button" className={tab === 'laporan' ? 'active' : ''} onClick={() => setTab('laporan')}>Laporan Stok</button>
    </div>
    {tab === 'laporan' ? <StockReportSection /> : (
    <section className="panel inventory-panel">
    <label>Gudang / Lokasi stok<select value={warehouse} onChange={(event) => { setWarehouse(event.target.value); load(event.target.value).catch((error) => setMessage(error.message)); }}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.branch_name ? `${item.branch_name} — ` : ''}{item.name}{item.type && TYPE_LABEL[item.type] ? ` (${TYPE_LABEL[item.type]})` : ''}</option>)}</select></label>
    {canManage && <button type="button" className="button-link" style={{ marginBottom: 8 }} onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Tutup' : '+ Tambah Gudang'}</button>}
    {showAdd && (
      <div style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8 }}>
        <input placeholder="Nama gudang (misal: Gudang Reject)" value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} />
        <select value={newWh.type} onChange={(e) => setNewWh({ ...newWh, type: e.target.value })}>
          <option value="utama">Gudang Utama</option>
          <option value="cadangan">Gudang Cadangan</option>
          <option value="reject">Gudang Reject (barang rusak/retur)</option>
        </select>
        <input placeholder="Keterangan (opsional)" value={newWh.description} onChange={(e) => setNewWh({ ...newWh, description: e.target.value })} />
        <button type="button" onClick={async () => {
          try {
            const r = await fetch(api + '/inventory/warehouses', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(newWh) });
            const b = await r.json();
            if (!r.ok) throw new Error(b.message);
            setMessage('Gudang "' + b.data.name + '" dibuat.');
            setShowAdd(false);
            setNewWh({ name: '', type: 'utama', description: '' });
            loadWarehouses().catch((error) => setMessage(error.message));
          } catch (e) { setMessage(e.message); }
        }}>Simpan Gudang</button>
      </div>
    )}
    <p className="muted">Produk tanpa varian memakai stok produk. Produk berwarna menampilkan stok setiap warna secara terpisah.</p>
    {canManage && warehouses.length > 0 && (
      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted-foreground)' }}>Kelola Gudang</strong>
        {warehouses.map((w) => (
          <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' }}>
            <span style={{ flex: 1, fontSize: 13 }}>{w.name}<small style={{ display: 'block', color: 'var(--muted-foreground)' }}>{TYPE_LABEL[w.type] || w.type}</small></span>
            <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }} onClick={() => {
              const next = prompt('Nama gudang baru:', w.name);
              if (!next?.trim() || next.trim() === w.name) return;
              fetch(api + '/inventory/warehouses/' + w.id, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next.trim(), type: w.type, description: w.description }) })
                .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setMessage('Gudang diganti nama menjadi "' + b.data.name + '".'); loadWarehouses().catch((x) => setMessage(x.message)); }).catch((e) => setMessage(e.message));
            }}>Rename</button>
            <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12, color: '#dc2626' }} onClick={() => {
              if (!window.confirm('Hapus gudang "' + w.name + '"? (hanya bisa jika stoknya kosong)')) return;
              fetch(api + '/inventory/warehouses/' + w.id, { method: 'DELETE', headers: headers() })
                .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setMessage(b.message); loadWarehouses().catch((x) => setMessage(x.message)); }).catch((e) => setMessage(e.message));
            }}>Hapus</button>
          </div>
        ))}
      </div>
    )}
    {message && <p className="message">{message}</p>}
    <div className="inventory-list">{products.map((product) => <article key={product.id} className="inventory-product"><header><div><strong>{product.name}</strong><span>{product.sku || 'Tanpa SKU'}</span></div>{product.variants.length > 0 ? <b>{product.variants.reduce((total, item) => total + Number(item.quantity), 0)} total varian</b> : <b>{product.standardStock?.quantity || 0} stok</b>}</header>{product.variants.length > 0 ? <div className="inventory-variants">{product.variants.map((variant) => <div key={variant.variant_id}><span className="inventory-color">{variant.variant_color}</span><strong>{variant.quantity}</strong><small>{variant.reserved_quantity} dialokasikan</small></div>)}{product.standardStock && Number(product.standardStock.quantity) > 0 && <p className="unallocated-stock">Stok umum {product.standardStock.quantity} belum dialokasikan ke warna.</p>}</div> : <div className="inventory-standard"><span>Stok produk</span><strong>{product.standardStock?.quantity || 0}</strong><small>{product.standardStock?.reserved_quantity || 0} dialokasikan</small></div>}</article>)}{!products.length && <p>Belum ada stok di gudang ini.</p>}</div>
  </section>
    )}
  </AppShell>;
}
