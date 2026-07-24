'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const blank = () => ({ product_id: '', variant_id: '', quantity: '', cost: '' });

export default function Incoming() {
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState('');
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function loadProducts(id) {
    const response = await fetch(api + '/inventory/incoming/products?branch_id=' + id, { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setProducts(body.data);
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/inventory/incoming/targets', { headers: headers() }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setStores(body.data);
      const id = String(body.data[0]?.id || '');
      setStore(id);
      if (id) loadProducts(id);
    }).catch((error) => setMessage(error.message));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [products, query]);

  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  }
  function addSelected() {
    const rows = [];
    for (const key of selected) {
      const [productId, variantId] = key.split(':');
      const product = products.find((p) => String(p.id) === productId);
      if (!product) continue;
      rows.push({ product_id: productId, variant_id: variantId || '', quantity: '', cost: product.cost || '' });
    }
    if (!rows.length) return;
    setItems((prev) => [...prev.filter((r) => r.product_id), ...rows]);
    setSelected(new Set());
    setQuery('');
  }
  function update(index, key, value) { setItems((rows) => rows.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: value } : row)); }
  function productFor(item) { return products.find((product) => String(product.id) === String(item.product_id)); }
  function remove(index) { setItems((rows) => rows.filter((_, i) => i !== index)); }
  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = items.map((item) => ({ ...item, product_id: Number(item.product_id), variant_id: item.variant_id ? Number(item.variant_id) : undefined, quantity: Number(item.quantity), cost: item.cost === '' ? '' : Number(item.cost) })).filter((i) => i.product_id && i.quantity > 0);
      if (!payload.length) throw new Error('Tambahkan minimal satu produk dengan jumlah > 0');
      const response = await fetch(api + '/inventory/incoming', { method: 'POST', headers: headers(), body: JSON.stringify({ branch_id: Number(store), items: payload, notes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage(String(body.data.items) + ' produk berhasil masuk ke ' + (stores.find((item) => String(item.id) === store)?.name || '') + '.');
      setItems([blank()]);
      setNotes('');
      setShowPicker(false);
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  return (
    <AppShell title="Produk Masuk" eyebrow="INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
      <section className="panel">
        <p className="muted">Pilih toko tujuan. Cari produk lalu centang banyak kode/varian sekaligus untuk dimasukkan ke daftar.</p>
        <form onSubmit={submit}>
          <label>
            Toko tujuan
            <select required value={store} onChange={(event) => { setStore(event.target.value); setItems([blank()]); setSelected(new Set()); setShowPicker(false); loadProducts(event.target.value).catch((error) => setMessage(error.message)); }}>
              {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <div className="product-picker">
            <div className="picker-toggle">
              <input type="text" placeholder="Cari produk / SKU…" value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setShowPicker(true)} />
              <button type="button" className="button-link" onClick={() => setShowPicker((v) => !v)}>{showPicker ? 'Tutup pencarian' : 'Cari produk'}</button>
            </div>
            {showPicker && (
              <div className="picker-list">
                {filtered.length === 0 && <p className="muted">Tidak ada produk cocok.</p>}
                {filtered.map((product) => (
                  <div key={product.id} className="picker-product">
                    <label className="picker-product-name">
                      <input type="checkbox" checked={product.variants.length === 0 ? selected.has(String(product.id)) : false} onChange={() => toggle(String(product.id))} disabled={product.variants.length > 0} />
                      <span>{product.sku || '—'} — {product.name}</span>
                    </label>
                    {product.variants.length > 0 && (
                      <div className="picker-variants">
                        {product.variants.map((variant) => {
                          const key = `${product.id}:${variant.id}`;
                          return <label key={variant.id}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /> {variant.color}</label>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" className="button-link" disabled={!selected.size} onClick={addSelected}>Tambahkan {selected.size} pilihan ke daftar</button>
              </div>
            )}
          </div>

          <div className="product-list">
            {items.map((item, index) => {
              const product = productFor(item);
              return (
                <article key={index}>
                  <label>
                    Produk
                    <select required value={item.product_id} onChange={(event) => { const next = products.find((entry) => String(entry.id) === event.target.value); update(index, 'product_id', event.target.value); update(index, 'variant_id', next?.variants?.length === 1 ? String(next.variants[0].id) : ''); }}>
                      <option value="">Pilih produk</option>
                      {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku || '—'} — {entry.name}</option>)}
                    </select>
                  </label>
                  {product?.variants?.length > 0 && (
                    <label>
                      Warna
                      <select required value={item.variant_id} onChange={(event) => update(index, 'variant_id', event.target.value)}>
                        <option value="">Pilih warna</option>
                        {product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.color}</option>)}
                      </select>
                    </label>
                  )}
                  <label>Jumlah<input required min="1" type="number" value={item.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} /></label>
                  <label>Harga modal<input min="0" type="number" value={item.cost} onChange={(event) => update(index, 'cost', event.target.value)} /></label>
                  {items.length > 1 && <button type="button" onClick={() => remove(index)}>Hapus</button>}
                </article>
              );
            })}
          </div>
          <button type="button" onClick={() => setItems((rows) => [...rows, blank()])}>+ Tambah baris manual</button>
          <label>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="submit" disabled={saving || !items.some((i) => i.product_id && Number(i.quantity) > 0)}>{saving ? 'Menyimpan…' : 'Simpan Produk Masuk'}</button>
          {message && <p className="message" role="status">{message}</p>}
        </form>
      </section>
    </AppShell>
  );
}
