'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const blank = () => ({ product_id: '', variant_id: '', quantity: '', cost: '' });
const CHANNELS = [
  { value: 'toko', label: 'Toko / internal' },
  { value: 'wa', label: 'Penjualan WhatsApp' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'reseller', label: 'Reseller' },
];

export default function Mutations() {
  const [mode, setMode] = useState('in');
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState('');
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState('');
  const [channel, setChannel] = useState('toko');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const h = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function loadProducts(id) {
    const r = await fetch(api + '/inventory/incoming/products?branch_id=' + id, { headers: h() });
    const b = await r.json();
    if (!r.ok) throw new Error(b.message);
    setProducts(b.data);
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/inventory/incoming/targets', { headers: h() }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setStores(b.data);
      const id = String(b.data[0]?.id || '');
      setStore(id);
      if (id) loadProducts(id);
    }).catch((e) => setMessage(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [products, query]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function addSelected() {
    const rows = [];
    for (const id of selected) rows.push({ product_id: id, variant_id: '', quantity: '', cost: '' });
    if (!rows.length) return;
    setItems((prev) => [...prev.filter((r) => r.product_id), ...rows]);
    setSelected(new Set());
    setQuery('');
  }
  function update(i, key, value) { setItems((rows) => rows.map((row, index) => index === i ? { ...row, [key]: value } : row)); }
  function remove(i) { setItems((rows) => rows.filter((_, index) => index !== i)); }

  async function submit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = items.map((i) => ({ product_id: Number(i.product_id), variant_id: i.variant_id ? Number(i.variant_id) : undefined, quantity: Number(i.quantity), cost: mode === 'in' && i.cost !== '' ? Number(i.cost) : undefined })).filter((i) => i.product_id && i.quantity > 0);
      if (!payload.length) throw new Error('Tambahkan minimal satu produk dengan jumlah > 0');
      const body = { branch_id: Number(store), items: payload, notes };
      if (mode === 'out') body.channel = channel;
      const r = await fetch(api + '/inventory/' + (mode === 'in' ? 'incoming' : 'outgoing'), { method: 'POST', headers: h(), body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      const channelLabel = mode === 'out' ? (CHANNELS.find((c) => c.value === channel)?.label || channel) : '';
      setMessage(b.data.items + ' produk ' + (mode === 'in' ? 'masuk' : 'keluar') + ' berhasil dicatat' + (channelLabel ? ' (' + channelLabel + ')' : '') + '.');
      setItems([blank()]);
      setNotes('');
      setShowPicker(false);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title="Mutasi Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <div className="tabs">
      <button type="button" className={mode === 'in' ? 'active' : ''} onClick={() => { setMode('in'); setItems([blank()]); }}>Produk Masuk</button>
      <button type="button" className={mode === 'out' ? 'active' : ''} onClick={() => { setMode('out'); setItems([blank()]); }}>Produk Keluar</button>
    </div>
    <section className="panel">
      <p className="muted">{mode === 'in' ? 'Catat barang yang masuk ke gudang/toko (pembelian atau penerimaan).' : 'Catat barang keluar tanpa transaksi penjualan: penjualan Shopee/TikTok/WA/reseller, atau keluar ke tujuan lain.'}</p>
      <form onSubmit={submit}>
        <label>Toko / gudang
          <select required value={store} onChange={(e) => { setStore(e.target.value); setItems([blank()]); setSelected(new Set()); setShowPicker(false); loadProducts(e.target.value).catch((x) => setMessage(x.message)); }}>
            {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {mode === 'out' && (
          <label>Keperluan / saluran
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        )}

        <div className="product-picker">
          <div className="picker-bar">
            <input type="text" placeholder="Ketik nama / SKU produk…" value={query} onChange={(e) => { setQuery(e.target.value); setShowPicker(true); }} />
            <button type="button" className="button-link" onClick={() => setShowPicker((v) => !v)}>{showPicker ? 'Tutup' : 'Cari'}</button>
          </div>
          {showPicker && (
            <div className="picker-list">
              {filtered.length === 0 && <p className="muted">{query.trim() ? 'Tidak ada produk cocok.' : 'Ketik untuk mencari produk.'}</p>}
              {filtered.map((product) => (
                <div key={product.id} className="picker-card">
                  <div className="picker-card-head">
                    <span className="picker-sku">{product.sku || 'Tanpa SKU'}</span>
                    <strong>{product.name}</strong>
                  </div>
                  <label className="picker-row">
                    <input type="checkbox" checked={selected.has(String(product.id))} onChange={() => toggle(String(product.id))} />
                    <span>Pilih produk ini</span>
                  </label>
                </div>
              ))}
              <div className="picker-footer">
                <small>{selected.size} dipilih</small>
                <button type="button" className="button-link" disabled={!selected.size} onClick={addSelected}>Tambahkan ke daftar</button>
              </div>
            </div>
          )}
        </div>

        <div className="product-list">
          {items.map((item, index) => {
            const p = products.find((entry) => String(entry.id) === String(item.product_id));
            return (
              <article key={index}>
                <label>Produk
                  <select required value={item.product_id} onChange={(e) => { update(index, 'product_id', e.target.value); update(index, 'variant_id', ''); }}>
                    <option value="">Pilih produk</option>
                    {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku || '—'} — {entry.name}</option>)}
                  </select>
                </label>
                {p && p.variants && p.variants.length > 0 && (
                  <label>Warna
                    <select value={item.variant_id} onChange={(e) => update(index, 'variant_id', e.target.value)}>
                      <option value="">Semua / tanpa warna</option>
                      {p.variants.map((v) => <option key={v.id} value={v.id}>{v.color}</option>)}
                    </select>
                  </label>
                )}
                <label>Jumlah<input required min="1" type="number" value={item.quantity} onChange={(e) => update(index, 'quantity', e.target.value)} /></label>
                {mode === 'in' && <label>Harga beli<input type="number" min="0" placeholder="opsional" value={item.cost} onChange={(e) => update(index, 'cost', e.target.value)} /></label>}
                {items.length > 1 && <button type="button" onClick={() => remove(index)}>Hapus</button>}
              </article>
            );
          })}
        </div>
        <button type="button" onClick={() => setItems((rows) => [...rows, blank()])}>+ Tambah baris manual</button>
        <label>Catatan<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button type="submit" disabled={saving || !items.some((i) => i.product_id && Number(i.quantity) > 0)}>{saving ? 'Menyimpan…' : 'Simpan ' + (mode === 'in' ? 'Produk Masuk' : 'Produk Keluar')}</button>
        {message && <p className="message" role="status">{message}</p>}
      </form>
    </section>
  </AppShell>;
}
