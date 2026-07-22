'use client';

import { useEffect, useState } from 'react';
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

  function update(index, key, value) { setItems((rows) => rows.map((row, itemIndex) => itemIndex === index ? { ...row, [key]: value } : row)); }
  function productFor(item) { return products.find((product) => String(product.id) === String(item.product_id)); }
  async function submit(event) {
    event.preventDefault();
    try {
      setSaving(true);
      const response = await fetch(api + '/inventory/incoming', { method: 'POST', headers: headers(), body: JSON.stringify({ branch_id: Number(store), items: items.map((item) => ({ ...item, product_id: Number(item.product_id), variant_id: item.variant_id ? Number(item.variant_id) : undefined, quantity: Number(item.quantity), cost: item.cost === '' ? '' : Number(item.cost) })), notes }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage(String(body.data.items) + ' produk berhasil masuk ke ' + (stores.find((item) => String(item.id) === store)?.name || '') + '.');
      setItems([blank()]);
      setNotes('');
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  return <AppShell title="Produk Masuk" eyebrow="INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}><section className="panel"><p className="muted">Pilih toko tujuan dan warna varian bila produk memiliki varian. Stok tiap warna akan tercatat terpisah.</p><form onSubmit={submit}><label>Toko tujuan<select required value={store} onChange={(event) => { setStore(event.target.value); setItems([blank()]); loadProducts(event.target.value).catch((error) => setMessage(error.message)); }}>{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="product-list">{items.map((item, index) => { const product = productFor(item); return <article key={index}><label>Produk<select required value={item.product_id} onChange={(event) => { const next = products.find((entry) => String(entry.id) === event.target.value); update(index, 'product_id', event.target.value); update(index, 'variant_id', next?.variants?.length === 1 ? String(next.variants[0].id) : ''); }}><option value="">Pilih produk</option>{products.map((entry) => <option key={entry.id} value={entry.id}>{entry.sku || '—'} — {entry.name}</option>)}</select></label>{product?.variants?.length > 0 && <label>Warna<select required value={item.variant_id} onChange={(event) => update(index, 'variant_id', event.target.value)}><option value="">Pilih warna</option>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.color}</option>)}</select></label>}<label>Jumlah<input required min="1" type="number" value={item.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} /></label><label>Harga modal<input min="0" type="number" value={item.cost} onChange={(event) => update(index, 'cost', event.target.value)} /></label>{items.length > 1 && <button type="button" onClick={() => setItems((rows) => rows.filter((_, itemIndex) => itemIndex !== index))}>Hapus</button>}</article>; })}</div><button type="button" onClick={() => setItems((rows) => [...rows, blank()])}>+ Tambah produk</button><label>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan semua produk masuk'}</button></form>{message && <p className="message">{message}</p>}</section></AppShell>;
}
