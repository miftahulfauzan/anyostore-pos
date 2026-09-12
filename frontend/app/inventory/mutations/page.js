'use client';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import SafeImage from '../../components/SafeImage';
import StockVariantPicker from '../../components/StockVariantPicker';
import mutationQuantity from './mutation-quantity.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const mediaUrl = (p) => (p ? api.replace('/api', '') + p : '');
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { normalizeQuantity } = mutationQuantity;

export function MutationPage({ initialMode = null, separatePage = false } = {}) {
  const [mode, setMode] = useState(initialMode || 'in');
  const [stores, setStores] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [store, setStore] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [transactionDate, setTransactionDate] = useState(localToday());
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState('toko');
  const [showChannels, setShowChannels] = useState(false);
  const [newChannel, setNewChannel] = useState({ value: '', name: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [picker, setPicker] = useState(null);
  const [quantityPrompt, setQuantityPrompt] = useState(null);
  const [quantityPromptQty, setQuantityPromptQty] = useState('1');
  const [quantityPromptError, setQuantityPromptError] = useState('');
  const h = () => ({ 'Content-Type': 'application/json'});

  // Gudang tipe utama selalu paling depan, sisanya abjad.
  const storeWarehouses = useMemo(() => allWarehouses
    .filter((w) => String(w.branch_id) === String(store))
    .sort((a, b) => (a.type === 'utama' ? 0 : 1) - (b.type === 'utama' ? 0 : 1) || String(a.name || '').localeCompare(String(b.name || ''))), [allWarehouses, store]);

  async function loadChannels() {
    const r = await fetch(api + '/inventory/channels', { headers: h() });
    const b = await r.json();
    if (!r.ok) throw new Error(b.message);
    setChannels(b.data || []);
    setChannel((c) => (b.data || []).some((x) => x.value === c) ? c : ((b.data || [])[0]?.value || 'toko'));
  }
  async function loadProducts(storeId, warehouseId) {
    if (!storeId || !warehouseId) { setProducts([]); return; }
    try {
      const r = await fetch(`${api}/inventory/incoming/products?branch_id=${storeId}&warehouse_id=${warehouseId}`, { headers: h() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setProducts(b.data || []);
    } catch (e) { setMessage(e.message); }
  }

  useEffect(() => {
    /* sesi via httpOnly cookie */
    const queryMode = new URLSearchParams(window.location.search).get('mode');
    if (!initialMode && (queryMode === 'in' || queryMode === 'out')) setMode(queryMode);
    loadChannels().catch((e) => setMessage(e.message));
    Promise.all([
      fetch(api + '/inventory/incoming/targets', { headers: h() }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); return b.data || []; }),
      fetch(api + '/inventory/warehouses/all', { headers: h() }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); return b.data || []; }),
      fetch(api + '/auth/me', { headers: h() }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); return b.data || null; }),
    ]).then(([brs, whs, user]) => {
      setStores(brs);
      setAllWarehouses(whs);
      // Default harus mengikuti cabang akun yang login, bukan urutan nama
      // cabang (yang bisa membuat Gudang Riject terpilih lebih dulu).
      const ownBranch = brs.find((branch) => String(branch.id) === String(user?.branch_id));
      const id = String(ownBranch?.id || brs[0]?.id || '');
      setStore(id);
      const list = whs.filter((w) => String(w.branch_id) === String(id));
      const preferred = list.find((w) => w.type === 'utama') || list[0];
      const wid = preferred ? String(preferred.id) : '';
      setWarehouse(wid);
      if (wid) loadProducts(id, wid);
      else if (id) setMessage('Cabang ini belum punya gudang aktif.');
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

  function addToCart(product, variant = null, qty = 1) {
    if (!variant && product.variants && product.variants.length > 0) {
      setMessage(`Produk ${product.name} punya varian — pilih warnanya dulu.`);
      return;
    }
    const key = `${product.id}:${variant?.id || 'umum'}`;
    setCart((cur) => {
      const found = cur.find((c) => c.key === key);
      if (found) return cur.map((c) => (c.key === key ? { ...c, quantity: c.quantity + qty } : c));
      return [...cur, { key, product_id: product.id, variant_id: variant?.id || null, name: product.name, sku: product.sku, color: variant?.color || null, quantity: qty }];
    });
  }
  function askQuantity(product) {
    setQuantityPrompt(product);
    setQuantityPromptQty('1');
    setQuantityPromptError('');
  }
  function confirmQuantity() {
    const qty = normalizeQuantity(quantityPromptQty);
    if (!qty) {
      setQuantityPromptError('Jumlah harus berupa bilangan bulat minimal 1.');
      return;
    }
    addToCart(quantityPrompt, null, qty);
    setQuantityPrompt(null);
  }
  function setQty(key, value) {
    const q = Number(value);
    setCart((cur) => cur.flatMap((c) => (c.key === key ? (q > 0 ? [{ ...c, quantity: q }] : []) : [c])));
  }
  const totalQty = cart.reduce((s, c) => s + Number(c.quantity || 0), 0);

  useEffect(() => {
    if (!cart.length) setCartOpen(false);
  }, [cart.length]);

  useEffect(() => {
    if (!cartOpen || !window.matchMedia('(max-width: 900px)').matches) return undefined;
    document.body.classList.add('mobile-cart-active');
    return () => document.body.classList.remove('mobile-cart-active');
  }, [cartOpen]);

  function openCart() {
    if (cart.length) setCartOpen(true);
  }

  async function submit() {
    if (!store || !warehouse) return setMessage('Pilih toko dan gudang terlebih dahulu.');
    const payload = cart.map((c) => ({ product_id: Number(c.product_id), variant_id: c.variant_id ? Number(c.variant_id) : undefined, quantity: Number(c.quantity) }));
    if (!payload.length) return setMessage('Belum ada produk di keranjang.');
    setSaving(true);
    setMessage('');
    try {
      const body = { branch_id: Number(store), warehouse_id: Number(warehouse), transaction_date: transactionDate, batch_number: batchNumber.trim(), notes, items: payload };
      if (mode === 'out') body.channel = channel;
      const r = await fetch(api + '/inventory/' + (mode === 'in' ? 'incoming' : 'outgoing'), { method: 'POST', headers: h(), body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.items + ' produk ' + (mode === 'in' ? 'masuk' : 'keluar') + ' berhasil dicatat. Batch/Nota: ' + b.data.batch_number);
      setCart([]);
      setCartOpen(false);
      loadProducts(store, warehouse);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title={mode === 'in' ? 'Stok Masuk' : 'Stok Keluar'} eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>

    <section className="panel">
      <h2>Informasi Transaksi</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label>Tanggal<input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} required /></label>
        <label>Batch / Nota<input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder={`Otomatis: BATCH-${transactionDate.replaceAll('-', '')}-001`} /></label>
        <label>Toko / Cabang<select value={store} required onChange={(e) => {
          const id = e.target.value;
          setStore(id);
          setCart([]);
          setCartOpen(false);
          const list = allWarehouses.filter((w) => String(w.branch_id) === String(id));
          const preferred = list.find((w) => w.type === 'utama') || list[0];
          const wid = preferred ? String(preferred.id) : '';
          setWarehouse(wid);
          if (wid) loadProducts(id, wid); else setProducts([]);
        }}>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type === 'gudang' ? ' (Gudang)' : ''}</option>)}
        </select></label>
        <label>Keterangan / Supplier<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: Supplier denim, retur, produksi…" /></label>
        {mode === 'out' && (
          <label>Keperluan / Saluran
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ flex: 1 }} value={channel} onChange={(e) => setChannel(e.target.value)}>
                {channels.filter((c) => c.is_active !== false).map((c) => <option key={c.value} value={c.value}>{c.name}</option>)}
              </select>
              <button type="button" className="button-link" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowChannels((v) => !v)}>{showChannels ? 'Tutup' : 'Kelola'}</button>
            </div>
          </label>
        )}
      </div>
      {mode === 'out' && showChannels && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Nilai (misal: offline)" value={newChannel.value} onChange={(e) => setNewChannel({ ...newChannel, value: e.target.value })} style={{ flex: 1 }} />
            <input placeholder="Nama (misal: Penjualan Offline)" value={newChannel.name} onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })} style={{ flex: 1.4 }} />
            <button type="button" onClick={async () => {
              try {
                const r = await fetch(api + '/inventory/channels', { method: 'POST', headers: h(), body: JSON.stringify(newChannel) });
                const b = await r.json();
                if (!r.ok) throw new Error(b.message);
                setNewChannel({ value: '', name: '' });
                setMessage('Saluran "' + b.data.name + '" ditambahkan.');
                loadChannels();
              } catch (e) { setMessage(e.message); }
            }}>Tambah</button>
          </div>
          {channels.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}<small style={{ display: 'block', color: 'var(--muted-foreground)' }}>{c.value}{c.is_active === false ? ' · nonaktif' : ''}</small></span>
              <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }} onClick={async () => {
                const next = window.prompt('Nama saluran:', c.name);
                if (!next?.trim() || next.trim() === c.name) return;
                try {
                  const r = await fetch(api + '/inventory/channels/' + c.id, { method: 'PUT', headers: h(), body: JSON.stringify({ name: next.trim() }) });
                  const b = await r.json();
                  if (!r.ok) throw new Error(b.message);
                  setMessage('Saluran diganti nama.');
                  loadChannels();
                } catch (e) { setMessage(e.message); }
              }}>Edit</button>
              <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }} onClick={async () => {
                try {
                  const r = await fetch(api + '/inventory/channels/' + c.id, { method: 'PUT', headers: h(), body: JSON.stringify({ is_active: c.is_active === false }) });
                  const b = await r.json();
                  if (!r.ok) throw new Error(b.message);
                  setMessage(c.is_active === false ? 'Saluran diaktifkan.' : 'Saluran dinonaktifkan.');
                  loadChannels();
                } catch (e) { setMessage(e.message); }
              }}>{c.is_active === false ? 'Aktifkan' : 'Nonaktifkan'}</button>
              <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12, color: '#dc2626' }} onClick={async () => {
                if (!window.confirm('Hapus saluran "' + c.name + '"?')) return;
                try {
                  const r = await fetch(api + '/inventory/channels/' + c.id, { method: 'DELETE', headers: h() });
                  const b = await r.json();
                  if (!r.ok) throw new Error(b.message);
                  setMessage('Saluran dihapus.');
                  loadChannels();
                } catch (e) { setMessage(e.message); }
              }}>Hapus</button>
            </div>
          ))}
        </div>
      )}
    </section>

    <div className="mutasi-layout">
      <section className="panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input aria-label="Cari produk berdasarkan nama atau kode" placeholder="Cari nama / kode produk…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180, minHeight: 40 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ minHeight: 40 }}>
            <option value="name_asc">Abjad A-Z</option>
            <option value="name_desc">Abjad Z-A</option>
            <option value="sku">Kode produk</option>
          </select>
        </div>
        <div className="stock-picker-grid">
          {visibleProducts.map((p) => (
            <article key={p.id} className="stock-picker-card" onClick={() => (p.variants && p.variants.length > 0 ? setPicker(p) : askQuantity(p))} title={p.variants && p.variants.length > 0 ? 'Pilih varian & jumlah' : 'Tentukan jumlah stok sebelum ditambahkan'}>
              <div className="stock-picker-media">
                {p.photo_path
                  ? <SafeImage src={mediaUrl(p.photo_path)} alt={p.name} />
                  : <div className="stock-picker-ph">Tanpa foto</div>}
              </div>
              <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{p.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{p.sku || 'Tanpa SKU'}</span>
                <span className="stock-picker-badge">Stok: {Number(p.stock || 0)}</span>
                {p.variants && p.variants.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
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

      <aside id="mutation-cart" className={`panel mutasi-cart${cartOpen ? ' open' : ''}`} aria-expanded={cartOpen}>
        <div className="mutasi-cart-header">
          <h2 style={{ margin: 0 }}>{mode === 'in' ? 'Keranjang Masuk' : 'Keranjang Keluar'}</h2>
          <button type="button" className="cart-close" onClick={() => setCartOpen(false)} aria-label="Tutup keranjang"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="mutasi-cart-list">
          {cart.length === 0 && <p className="muted mutasi-cart-empty">Belum ada produk di keranjang.</p>}
          {cart.map((c) => (
            <div key={c.key} className="mutasi-cart-item">
              <div className="mutasi-cart-item-info">
                <strong>{c.name}</strong>
                <span>{c.sku}{c.color ? ` · ${c.color}` : ' · Stok umum'}</span>
              </div>
              <input
                className="mutasi-cart-qty"
                type="number"
                min="1"
                value={c.quantity}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => setQty(c.key, e.target.value)}
                aria-label={`Jumlah ${c.name}${c.color ? ` ${c.color}` : ''}`}
              />
              <button className="mutasi-cart-remove" type="button" onClick={() => setQty(c.key, 0)} aria-label={`Hapus ${c.name}`}>×</button>
            </div>
          ))}
        </div>
        <div className="mutasi-cart-footer">
          <div className="mutasi-cart-summary">
            <span>Total Qty</span><strong>{totalQty}</strong>
          </div>
          <button className="mutasi-cart-submit" type="button" disabled={saving || !cart.length} onClick={submit}>{saving ? 'Menyimpan…' : `Simpan ${mode === 'in' ? 'Stock Masuk' : 'Stock Keluar'}`}</button>
          {message && <p className="message" role="status">{message}</p>}
        </div>
      </aside>
    </div>
    {!cartOpen && cart.length > 0 && <button type="button" className="cart-fab" onClick={openCart} aria-expanded={cartOpen} aria-controls="mutation-cart"><span>Keranjang</span><strong>{cart.length} produk · {totalQty} pcs</strong></button>}
    {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)} aria-hidden="true" />}
    {picker && <StockVariantPicker product={picker} onClose={() => setPicker(null)} onAdd={(p, v, q) => { addToCart(p, v, q); setPicker(null); }} />}
    {quantityPrompt && <div className="quantity-dialog-backdrop" onMouseDown={() => setQuantityPrompt(null)}>
      <section className="quantity-dialog" role="dialog" aria-modal="true" aria-labelledby="mutation-quantity-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="quantity-dialog-heading">
          <div>
            <strong id="mutation-quantity-title">Masukkan jumlah</strong>
            <span>{quantityPrompt.name}</span>
          </div>
          <button type="button" className="quantity-dialog-close" onClick={() => setQuantityPrompt(null)} aria-label="Tutup">×</button>
        </div>
        <p className="muted">Tentukan jumlah stok yang akan {mode === 'in' ? 'dimasukkan' : 'dikeluarkan'} sebelum produk masuk ke keranjang.</p>
        <label>Jumlah stok
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            autoFocus
            value={quantityPromptQty}
            onChange={(e) => { setQuantityPromptQty(e.target.value); setQuantityPromptError(''); }}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmQuantity(); if (e.key === 'Escape') setQuantityPrompt(null); }}
          />
        </label>
        {quantityPromptError && <p className="message" role="alert">{quantityPromptError}</p>}
        <div className="quantity-dialog-actions">
          <button type="button" className="secondary" onClick={() => setQuantityPrompt(null)}>Batal</button>
          <button type="button" onClick={confirmQuantity}>Tambah · {normalizeQuantity(quantityPromptQty) || 0} pcs</button>
        </div>
      </section>
    </div>}
    
  </AppShell>;
}

export default function Mutations() {
  // Keep old bookmarks usable without bringing back the combined tab screen.
  return <MutationPage initialMode="in" separatePage />;
}
