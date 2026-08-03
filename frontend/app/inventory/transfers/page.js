'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const mediaUrl = (p) => (p ? api.replace('/api', '') + p : '');

export default function TransferPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const h = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  const targets = useMemo(() => warehouses.filter((w) => String(w.id) !== String(from)), [warehouses, from]);
  // Label gudang: kalau gudang bernama sama dengan tokonya (toko = gudang),
  // tampilkan nama tokonya saja. Kalau beda, tampilkan "Toko — Gudang (Tipe)".
  const whLabel = (w) => {
    const type = w.type ? ` (${w.type.charAt(0).toUpperCase()}${w.type.slice(1)})` : '';
    if (w.branch_name && w.branch_name === w.name) return w.name;
    if (w.branch_name && w.branch_name !== w.name) return `${w.branch_name} — ${w.name}${type}`;
    return `${w.name || w.branch_name}${type}`;
  };

  async function loadProducts(warehouseId) {
    if (!warehouseId) { setProducts([]); return; }
    try {
      const wh = warehouses.find((w) => String(w.id) === String(warehouseId));
      const r = await fetch(`${api}/inventory/incoming/products?branch_id=${wh?.branch_id || ''}&warehouse_id=${warehouseId}`, { headers: h() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setProducts(b.data || []);
    } catch (e) { setMessage(e.message); }
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/inventory/warehouses/all', { headers: h() }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      const list = b.data || [];
      setWarehouses(list);
      const first = String(list[0]?.id || '');
      setFrom(first);
      const second = String(list.find((w) => String(w.id) !== first)?.id || '');
      setTo(second);
      if (first) loadProducts(first);
    }).catch((e) => setMessage(e.message));
  }, []);

  const visibleProducts = useMemo(() => {
    let list = products;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'name_desc') sorted.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
    else if (sort === 'sku') sorted.sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || '')));
    else sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return sorted;
  }, [products, query, sort]);

  function addToCart(product, variant = null) {
    const key = `${product.id}:${variant?.id || 'umum'}`;
    setCart((cur) => {
      const found = cur.find((c) => c.key === key);
      if (found) return cur.map((c) => (c.key === key ? { ...c, quantity: c.quantity + 1 } : c));
      return [...cur, { key, product_id: product.id, variant_id: variant?.id || null, name: product.name, sku: product.sku, color: variant?.color || null, quantity: 1 }];
    });
  }
  function setQty(key, value) {
    const q = Number(value);
    setCart((cur) => cur.flatMap((c) => (c.key === key ? (q > 0 ? [{ ...c, quantity: q }] : []) : [c])));
  }
  const totalQty = cart.reduce((s, c) => s + Number(c.quantity || 0), 0);

  async function submit() {
    if (!from || !to || from === to) return setMessage('Pilih gudang asal dan tujuan yang berbeda.');
    const payload = cart.map((c) => ({ product_id: Number(c.product_id), variant_id: c.variant_id ? Number(c.variant_id) : undefined, quantity: Number(c.quantity) }));
    if (!payload.length) return setMessage('Belum ada produk di keranjang.');
    setSaving(true);
    setMessage('');
    try {
      const fromWh = warehouses.find((w) => String(w.id) === String(from));
      const toWh = warehouses.find((w) => String(w.id) === String(to));
      const isInter = fromWh && toWh && String(fromWh.branch_id) !== String(toWh.branch_id);
      const url = isInter ? api + '/inventory-control/transfers/inter-store' : api + '/inventory-control/transfers';
      const r = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify({ from_warehouse_id: Number(from), to_warehouse_id: Number(to), items: payload, notes }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Transfer stok berhasil (' + b.data.status + ').' + (b.data.auto_created ? ' Produk yang belum ada di tujuan dibuat otomatis.' : ''));
      setCart([]);
      loadProducts(from);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title="Transfer Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="panel">
      <h2>Informasi Transfer</h2>
      <p className="muted">Stok asal berkurang, stok tujuan bertambah. Transfer antar cabang (owner) otomatis membuat produk yang belum ada di tujuan.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label>Dari (lokasi asal)
          <select required value={from} onChange={(e) => {
            const id = e.target.value;
            setFrom(id);
            setCart([]);
            if (String(to) === String(id)) {
              const next = String(warehouses.find((w) => String(w.id) !== String(id))?.id || '');
              setTo(next);
            }
            loadProducts(id);
          }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{whLabel(w)}</option>)}
          </select>
        </label>
        <label>Ke (lokasi tujuan)
          <select required value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Pilih tujuan…</option>
            {targets.map((w) => <option key={w.id} value={w.id}>{whLabel(w)}</option>)}
          </select>
        </label>
        <label style={{ gridColumn: 'span 2' }}>Keterangan<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: kirim ke toko, mutasi pusat, retur reject…" /></label>
      </div>
    </section>

    <div className="mutasi-layout">
      <section className="panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input placeholder="Cari nama / kode produk…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180, minHeight: 40 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ minHeight: 40 }}>
            <option value="name_asc">Abjad A-Z</option>
            <option value="name_desc">Abjad Z-A</option>
            <option value="sku">Kode produk</option>
          </select>
        </div>
        <div className="stock-picker-grid">
          {visibleProducts.map((p) => (
            <article key={p.id} className="stock-picker-card" onClick={() => addToCart(p)} title="Klik untuk transfer stok umum">
              {p.photo_path ? <img src={mediaUrl(p.photo_path)} alt="" loading="lazy" /> : <div className="stock-picker-ph">Tanpa foto</div>}
              <div style={{ padding: 8, display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{p.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{p.sku || 'Tanpa SKU'}</span>
                <span className="stock-picker-badge">Stok asal: {Number(p.stock || 0)}</span>
                {p.variants && p.variants.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    {p.variants.map((v) => (
                      <button key={v.id} type="button" className="small secondary" title={`Stok ${v.color}: ${v.stock}`} onClick={() => addToCart(p, v)}>{v.color} ({v.stock})</button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          {!visibleProducts.length && <p className="muted" style={{ gridColumn: '1/-1' }}>Tidak ada produk{query ? ` cocok dengan "${query}"` : ''}.</p>}
        </div>
      </section>

      <aside className="panel mutasi-cart">
        <h2>Keranjang Transfer</h2>
        {cart.length === 0 && <p className="muted">Belum ada produk di keranjang.</p>}
        {cart.map((c) => (
          <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, display: 'block' }}>{c.name}</strong>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.sku}{c.color ? ` · ${c.color}` : ' · Stok umum'}</span>
            </div>
            <input type="number" min="1" value={c.quantity} onChange={(e) => setQty(c.key, e.target.value)} style={{ width: 64, minHeight: 34 }} />
            <button type="button" onClick={() => setQty(c.key, 0)} aria-label="Hapus" style={{ minWidth: 30, minHeight: 30 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', fontWeight: 700 }}>
          <span>Total Qty</span><span>{totalQty}</span>
        </div>
        <button disabled={saving || !cart.length} onClick={submit} style={{ width: '100%' }}>{saving ? 'Memproses…' : 'Transfer Stok'}</button>
        {message && <p className="message" role="status" style={{ marginTop: 10 }}>{message}</p>}
      </aside>
    </div>
    <style>{`
      .mutasi-layout { display: grid; grid-template-columns: 1fr 360px; gap: 16; align-items: start; }
      .mutasi-cart { position: sticky; top: 76; }
      .stock-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      .stock-picker-card { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; transition: all .2s; }
      .stock-picker-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.08); border-color: #1e3a5f; }
      .stock-picker-card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; background: #f1f5f9; }
      .stock-picker-ph { width: 100%; aspect-ratio: 3/4; display: grid; place-items: center; color: #94a3b8; font-size: 11px; background: #f1f5f9; }
      .stock-picker-badge { padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #1e3a5f; font-size: 11px; font-weight: 700; }
      @media (max-width: 900px) {
        .mutasi-layout { grid-template-columns: 1fr; }
        .mutasi-cart { position: static; }
        .stock-picker-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
      }
    `}</style>
  </AppShell>;
}
