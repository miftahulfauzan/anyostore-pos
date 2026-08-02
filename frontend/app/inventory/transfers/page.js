'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const blank = () => ({ product_id: '', variant_id: '', quantity: '' });
const TYPE_LABEL = { utama: 'Gudang Utama', cadangan: 'Gudang Cadangan', reject: 'Gudang Reject' };

export default function TransferPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [targets, setTargets] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const h = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function loadProducts(warehouseId) {
    if (!warehouseId) return;
    const r = await fetch(api + '/inventory/incoming/products?branch_id=' + warehouseId.split('-')[0], { headers: h() });
    const b = await r.json();
    if (!r.ok) throw new Error(b.message);
    setProducts(b.data);
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/auth/me', { headers: h() }).then((r) => r.json()).then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); }).catch(() => {});
    fetch(api + '/inventory/warehouses', { headers: h() }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setWarehouses(b.data);
      const first = String(b.data[0]?.id || '');
      setFrom(first);
      if (first) loadProducts(first).catch((x) => setMessage(x.message));
    }).catch((e) => setMessage(e.message));
  }, []);

  // Tujuan: gudang lain di cabang ini (semua role) + gudang semua cabang (owner)
  useEffect(() => {
    if (isOwner) {
      fetch(api + '/settings/branches', { headers: h() }).then((r) => r.json()).then((b) => {
        const branches = b.data || [];
        Promise.all(branches.filter((br) => br.is_active).map((br) =>
          fetch(api + '/inventory/warehouses?branch_id=' + br.id, { headers: h() }).then((r) => r.json()).then((bb) => (bb.data || []).map((w) => ({ ...w, branch_name: br.name }))).catch(() => [])
        )).then((all) => setTargets(all.flat()));
      }).catch(() => {});
    } else {
      setTargets(warehouses.map((w) => ({ ...w, branch_name: '' })));
    }
  }, [isOwner, warehouses]);

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
    for (const id of selected) rows.push({ product_id: id, variant_id: '', quantity: '' });
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
      if (!from || !to || from === to) throw new Error('Pilih gudang asal dan tujuan yang berbeda');
      setSaving(true);
      const payload = items.map((i) => ({ product_id: Number(i.product_id), variant_id: i.variant_id ? Number(i.variant_id) : undefined, quantity: Number(i.quantity) })).filter((i) => i.product_id && i.quantity > 0);
      if (!payload.length) throw new Error('Tambahkan minimal satu produk dengan jumlah > 0');
      const isInter = targets.find((t) => String(t.id) === String(to))?.branch_name;
      const url = isInter ? api + '/inventory-control/transfers/inter-store' : api + '/inventory-control/transfers';
      const r = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify({ from_warehouse_id: Number(from), to_warehouse_id: Number(to), items: payload, notes }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Transfer stok berhasil (' + b.data.status + ').' + (b.data.auto_created ? ' Produk yang belum ada di tujuan dibuat otomatis.' : ''));
      setItems([blank()]);
      setNotes('');
      setShowPicker(false);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  const fromWarehouse = warehouses.find((w) => String(w.id) === String(from));

  return <AppShell title="Transfer Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <section className="panel">
      <p className="muted">Pindahkan stok antar gudang: gudang → gudang tujuan (termasuk gudang reject), atau antar toko. Stok asal berkurang, stok tujuan bertambah. Produk yang belum ada di toko tujuan dibuat otomatis (katalog, warna, dan foto disalin).</p>
      <form onSubmit={submit}>
        <label>Gudang asal
          <select required value={from} onChange={(e) => { setFrom(e.target.value); setItems([blank()]); setSelected(new Set()); setShowPicker(false); loadProducts(e.target.value).catch((x) => setMessage(x.message)); }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.type && TYPE_LABEL[w.type] ? ` (${TYPE_LABEL[w.type]})` : ''}</option>)}
          </select>
        </label>
        <label>Gudang tujuan
          <select required value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Pilih gudang tujuan…</option>
            {targets.filter((w) => String(w.id) !== String(from)).map((w) => <option key={w.id} value={w.id}>{w.branch_name ? `${w.branch_name} — ` : ''}{w.name}{w.type && TYPE_LABEL[w.type] ? ` (${TYPE_LABEL[w.type]})` : ''}</option>)}
          </select>
        </label>

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
                {items.length > 1 && <button type="button" onClick={() => remove(index)}>Hapus</button>}
              </article>
            );
          })}
        </div>
        <button type="button" onClick={() => setItems((rows) => [...rows, blank()])}>+ Tambah baris manual</button>
        <label>Catatan<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button type="submit" disabled={saving || !items.some((i) => i.product_id && Number(i.quantity) > 0)}>{saving ? 'Memproses…' : 'Transfer Stok'}</button>
        {message && <p className="message" role="status">{message}</p>}
      </form>
    </section>
  </AppShell>;
}
