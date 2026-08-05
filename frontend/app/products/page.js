'use client';

import { useEffect, useRef, useState } from 'react';
import { Barcode, Pencil, Trash2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import BarcodeLabel from '../components/BarcodeLabel';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState('grid');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [isGudang, setIsGudang] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const loadSeq = useRef(0);

  async function load(keyword = search) {
    /* sesi via httpOnly cookie */
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (keyword.trim()) params.set('search', keyword.trim());
      if (sort) params.set('sort', sort);
      if (branchId) params.set('branch_id', branchId);
      const response = await fetch(`${apiUrl}/products?${params}`, { headers: {} });
      const body = await response.json();
      if (seq !== loadSeq.current) return;
      if (!response.ok) throw new Error(body.message || 'Gagal memuat produk');
      setProducts(body.data || []);
      setSelected(new Set());
    } catch (error) { if (seq === loadSeq.current) setMessage(error.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => {
    fetch(`${apiUrl}/auth/me`, { headers: {} })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); if (b?.data?.role === 'gudang') setIsGudang(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOwner && !isGudang) return;
    fetch(`${apiUrl}/settings/branches`, { headers: {} })
      .then((r) => r.json())
      .then((b) => {
        const list = (b.data || []).filter((br) => br.is_active);
        setBranches(isGudang ? list.filter((br) => br.type === 'gudang') : list);
      })
      .catch(() => {});
  }, [isOwner, isGudang]);

  useEffect(() => { load(''); }, [branchId]);
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 260);
    return () => window.clearTimeout(timer);
  }, [search, sort]);

  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';

  async function deleteProduct(product) {
    if (!window.confirm(`Hapus "${product.name}"?`)) return;
    try {
      const r = await fetch(`${apiUrl}/products/${product.id}`, { method: 'DELETE', headers: {} });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.message);
      load(search);
    } catch (e) { setMessage(e.message); }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))));
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (selected.size > 200) { setMessage('Maksimal 200 produk dalam satu kali hapus. Kurangi pilihan dulu.'); return; }
    const count = selected.size;
    if (!window.confirm(`Hapus ${count} produk terpilih? Produk yang punya riwayat transaksi akan dinonaktifkan, sisanya dihapus permanen.`)) return;
    try {
      const r = await fetch(`${apiUrl}/products/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.message);
      setSelected(new Set());
      load(search);
    } catch (e) { setMessage(e.message); }
  }

  const chosenBarcodes = Array.from({ length: Math.min(99, Number(barcodeCopies) || 1) }, () => barcodeProduct);

  return <AppShell title="Produk & Inventori" eyebrow="KATALOG PRODUK" actions={<><a className="button-link" href="/products/photos">Upload Foto Massal</a><a className="button-link" href="/products/new">Tambah Produk</a></>}>
    <section className="panel catalog-panel">
      <div className="section-heading"><div><h2>Daftar Produk</h2><p>Cari nama, SKU, atau barcode. Kelola foto, video, varian, dan cetak barcode dari daftar ini.</p></div><div className="catalog-view-controls"><span className="item-count">{loading ? 'Memuat…' : `${products.length} produk`}</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Urutkan produk" style={{ minHeight: 36, padding: '.4rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: '#fff', fontSize: '.78rem' }}><option value="name">Nama A-Z</option><option value="name_desc">Nama Z-A</option><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="price_asc">Harga termurah</option><option value="price_desc">Harga termahal</option><option value="stock_asc">Stok terendah</option><option value="stock_desc">Stok tertinggi</option></select><button type="button" className={view === 'grid' ? 'view-button selected' : 'view-button'} onClick={() => setView('grid')} aria-pressed={view === 'grid'}>Tampilan grid</button><button type="button" className={view === 'list' ? 'view-button selected' : 'view-button'} onClick={() => setView('list')} aria-pressed={view === 'list'}>Tampilan daftar</button></div></div>
      <label className="catalog-search">Cari produk<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, SKU, atau barcode" autoComplete="off" /></label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ display: 'inline-flex', gap: '.45rem', alignItems: 'center', fontSize: '.85rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={products.length > 0 && selected.size === products.length} onChange={toggleSelectAll} style={{ accentColor: 'var(--primary)' }} />
          Pilih semua ({products.length})
        </label>
        {selected.size > 0 && (
          <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', padding: '.35rem .65rem', borderRadius: 999, background: 'rgba(30,58,95,.08)', color: 'var(--primary)', fontWeight: 700, fontSize: '.82rem' }}>
            {selected.size} dipilih
            <button type="button" className="small secondary" onClick={() => setSelected(new Set())}>Batalkan</button>
            <button type="button" className="small" onClick={deleteSelected} style={{ background: '#dc2626', color: '#fff' }}>Hapus terpilih</button>
          </span>
        )}
      </div>
      {(isOwner || isGudang) && (
        <label style={{ display: 'block', marginBottom: 10 }}>{isGudang ? 'Gudang / Cabang' : 'Toko / Cabang'}<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          {isGudang ? <><option value="all">Semua Gudang</option></> : <option value="">Toko saya</option>}
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
      )}
      {message && <p className="message" role="status">{message}</p>}
      {loading ? <p>Memuat produk…</p> : <div className={`product-list ${view === 'grid' ? 'grid-view' : ''}`}>{products.map((product) => <article key={product.id} className="product-row" style={selected.has(product.id) ? { outline: '2px solid var(--primary)', outlineOffset: 2, borderRadius: 10 } : undefined}>
        <div className="product-photo" style={{ position: 'relative' }}>{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt={`Foto ${product.name}`} loading="lazy" style={product.photo_transform ? (()=>{const t=(product.photo_transform||'').split(',').map(Number); return {objectFit:'cover',objectPosition:'center',transform:`translate(${t[1]||0}%,${t[2]||0}%) scale(${t[0]})`,width:'100%',height:'100%'};})():{}} /> : <span>Tanpa foto</span>}
          <label title="Pilih produk" style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,.92)', border: '1px solid rgba(0,0,0,.16)', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,.22)' }}>
            <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }} aria-label={`Pilih ${product.name}`} />
          </label></div>
        <div className="product-description">
          <strong>{product.name}</strong>
          <span>{product.category_name} · {product.sku || 'Tanpa SKU'}</span>
          {Number(product.variant_count) > 0 && <div className="variant-summary"><span>{product.variant_count} varian</span>{String(product.variant_colors || '').split('|').filter(Boolean).slice(0, 4).map((color) => <i key={color} title={color}>{color}</i>)}</div>}
          <div className="product-actions">
            <button type="button" className="icon-action" title="Cetak barcode" onClick={() => { setBarcodeProduct(product); setBarcodeCopies(1); }}><Barcode size={15} /></button>
            <a className="icon-action" title="Kelola produk" href={`/products/${product.id}/edit`}><Pencil size={15} /></a>
            <button type="button" className="icon-action danger" title="Hapus produk" onClick={() => deleteProduct(product)}><Trash2 size={15} /></button>
          </div>
        </div>
        <div><strong>Rp{Number(product.price).toLocaleString('id-ID')}</strong><span>Stok {product.stock}</span></div>
      </article>)}{!products.length && <div className="empty-state"><strong>Produk tidak ditemukan.</strong><span>Coba kata kunci lain atau tambahkan produk baru.</span><a href="/products/new">Tambah produk</a></div>}</div>}
    </section>

    {barcodeProduct && (
      <div onClick={() => setBarcodeProduct(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>Cetak Barcode — {barcodeProduct.name}</strong>
            <button onClick={() => setBarcodeProduct(null)} aria-label="Tutup" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', fontSize: 16, cursor: 'pointer', color: '#475569' }}>×</button>
          </div>
          <div className="barcode-print-area" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chosenBarcodes.map((item, index) => <BarcodeLabel key={index} item={{ ...item, barcode_value: item.barcode || item.sku || item.name, variant_color: '' }} />)}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
            <label style={{ flex: 1 }}>Jumlah salinan<input type="number" min="1" max="99" value={barcodeCopies} onChange={(e) => setBarcodeCopies(e.target.value)} /></label>
            <button type="button" onClick={() => window.print()} style={{ flex: 1, minHeight: 42, borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cetak</button>
          </div>
        </div>
      </div>
    )}
  </AppShell>;
}
