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
  const [view, setView] = useState('grid');
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const loadSeq = useRef(0);
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');

  async function load(keyword = search) {
    if (!token()) { window.location.assign('/'); return; }
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const query = keyword.trim() ? `?limit=500&search=${encodeURIComponent(keyword.trim())}` : '?limit=500';
      const response = await fetch(`${apiUrl}/products${query}`, { headers: { Authorization: `Bearer ${token()}` } });
      const body = await response.json();
      if (seq !== loadSeq.current) return;
      if (!response.ok) throw new Error(body.message || 'Gagal memuat produk');
      setProducts(body.data || []);
    } catch (error) { if (seq === loadSeq.current) setMessage(error.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => { load(''); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';

  async function deleteProduct(product) {
    if (!window.confirm(`Hapus "${product.name}"?`)) return;
    try {
      const r = await fetch(`${apiUrl}/products/${product.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.message);
      load(search);
    } catch (e) { setMessage(e.message); }
  }

  const chosenBarcodes = Array.from({ length: Math.min(99, Number(barcodeCopies) || 1) }, () => barcodeProduct);

  return <AppShell title="Produk & Inventori" eyebrow="KATALOG PRODUK" actions={<a className="button-link" href="/products/new">Tambah Produk</a>}>
    <section className="panel catalog-panel">
      <div className="section-heading"><div><h2>Daftar Produk</h2><p>Cari nama, SKU, atau barcode. Kelola foto, video, varian, dan cetak barcode dari daftar ini.</p></div><div className="catalog-view-controls"><span className="item-count">{loading ? 'Memuat…' : `${products.length} produk`}</span><button type="button" className={view === 'grid' ? 'view-button selected' : 'view-button'} onClick={() => setView('grid')} aria-pressed={view === 'grid'}>Tampilan grid</button><button type="button" className={view === 'list' ? 'view-button selected' : 'view-button'} onClick={() => setView('list')} aria-pressed={view === 'list'}>Tampilan daftar</button></div></div>
      <label className="catalog-search">Cari produk<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, SKU, atau barcode" autoComplete="off" /></label>
      {message && <p className="message" role="status">{message}</p>}
      {loading ? <p>Memuat produk…</p> : <div className={`product-list ${view === 'grid' ? 'grid-view' : ''}`}>{products.map((product) => <article key={product.id} className="product-row">
        <div className="product-photo">{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt={`Foto ${product.name}`} loading="lazy" style={product.photo_transform ? (()=>{const t=(product.photo_transform||'').split(',').map(Number); return {objectFit:'cover',objectPosition:'center',transform:`translate(${t[1]||0}%,${t[2]||0}%) scale(${t[0]})`,width:'100%',height:'100%'};})():{}} /> : <span>Tanpa foto</span>}</div>
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

    <style>{`
      .icon-action { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; color: #334155; cursor: pointer; text-decoration: none; transition: all .2s; }
      .icon-action:hover { border-color: #1e3a5f; color: #1e3a5f; background: #f8fafc; }
      .icon-action.danger:hover { border-color: #dc2626; color: #dc2626; background: #fef2f2; }
      @media print { body * { visibility: hidden; } .barcode-print-area, .barcode-print-area * { visibility: visible; } .barcode-print-area { position: fixed; inset: 0; } }
    `}</style>
  </AppShell>;
}
