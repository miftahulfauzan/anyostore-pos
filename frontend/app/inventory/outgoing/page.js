'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const blank = () => ({ product_id: '', quantity: '' });

export default function Outgoing() {
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
    for (const id of selected) {
      rows.push({ product_id: id, quantity: '' });
    }
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
      const payload = items.map((i) => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) })).filter((i) => i.product_id && i.quantity > 0);
      if (!payload.length) throw new Error('Tambahkan minimal satu produk dengan jumlah > 0');
      const r = await fetch(api + '/inventory/outgoing', { method: 'POST', headers: h(), body: JSON.stringify({ branch_id: Number(store), items: payload, notes }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.items + ' produk keluar berhasil dicatat dari ' + (stores.find((s) => String(s.id) === store)?.name || '') + '.');
      setItems([blank()]);
      setNotes('');
      setShowPicker(false);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title="Produk Keluar" eyebrow="INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="panel">
      <p className="muted">Gunakan saat barang dibawa ke gudang atau keluar dari toko tanpa transaksi penjualan. Cari produk lalu centang banyak kode sekaligus.</p>
      <form onSubmit={submit}>
        <label>Toko asal
          <select required value={store} onChange={(e) => { setStore(e.target.value); setItems([blank()]); setSelected(new Set()); setShowPicker(false); loadProducts(e.target.value).catch((x) => setMessage(x.message)); }}>
            {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <div className="product-picker">
          <div className="picker-toggle">
            <input type="text" placeholder="Cari produk / SKU…" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setShowPicker(true)} />
            <button type="button" className="button-link" onClick={() => setShowPicker((v) => !v)}>{showPicker ? 'Tutup pencarian' : 'Cari produk'}</button>
          </div>
          {showPicker && (
            <div className="picker-list">
              {filtered.length === 0 && <p className="muted">Tidak ada produk cocok.</p>}
              {filtered.map((product) => (
                <label key={product.id} className="picker-product-name">
                  <input type="checkbox" checked={selected.has(String(product.id))} onChange={() => toggle(String(product.id))} />
                  <span>{product.sku || '—'} — {product.name}</span>
                </label>
              ))}
              <button type="button" className="button-link" disabled={!selected.size} onClick={addSelected}>Tambahkan {selected.size} pilihan ke daftar</button>
            </div>
          )}
        </div>

        <div className="product-list">
          {items.map((item, index) => (
            <article key={index}>
              <label>Produk
                <select required value={item.product_id} onChange={(e) => update(index, 'product_id', e.target.value)}>
                  <option value="">Pilih produk</option>
                  {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku || '—'} — {entry.name}</option>)}
                </select>
              </label>
              <label>Jumlah<input required min="1" type="number" value={item.quantity} onChange={(e) => update(index, 'quantity', e.target.value)} /></label>
              {items.length > 1 && <button type="button" onClick={() => remove(index)}>Hapus</button>}
            </article>
          ))}
        </div>
        <button type="button" onClick={() => setItems((rows) => [...rows, blank()])}>+ Tambah baris manual</button>
        <label>Catatan<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button type="submit" disabled={saving || !items.some((i) => i.product_id && Number(i.quantity) > 0)}>{saving ? 'Menyimpan…' : 'Simpan Produk Keluar'}</button>
        {message && <p className="message" role="status">{message}</p>}
      </form>
    </section>
  </AppShell>;
}
