'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');

  async function load(keyword = search) {
    if (!token()) { window.location.assign('/'); return; }
    setLoading(true);
    try {
      const query = keyword.trim() ? `?limit=500&search=${encodeURIComponent(keyword.trim())}` : '?limit=500';
      const response = await fetch(`${apiUrl}/products${query}`, { headers: { Authorization: `Bearer ${token()}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal memuat produk');
      setProducts(body.data || []);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(''); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';
  return <AppShell title="Produk & Inventori" eyebrow="KATALOG PRODUK" actions={<a className="button-link" href="/products/new">Tambah Produk</a>}>
    <section className="panel catalog-panel">
      <div className="section-heading"><div><h2>Daftar Produk</h2><p>Cari nama, SKU, atau barcode. Kelola seluruh foto, video, dan foto varian dari halaman Edit Produk.</p></div><div className="catalog-view-controls"><span className="item-count">{loading ? 'Memuat…' : `${products.length} produk`}</span><button type="button" className={view === 'grid' ? 'view-button selected' : 'view-button'} onClick={() => setView('grid')} aria-pressed={view === 'grid'}>Tampilan grid</button><button type="button" className={view === 'list' ? 'view-button selected' : 'view-button'} onClick={() => setView('list')} aria-pressed={view === 'list'}>Tampilan daftar</button></div></div>
      <label className="catalog-search">Cari produk<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, SKU, atau barcode" autoComplete="off" /></label>
      {message && <p className="message" role="status">{message}</p>}
      {loading ? <p>Memuat produk…</p> : <div className={`product-list ${view === 'grid' ? 'grid-view' : ''}`}>{products.map((product) => <article key={product.id} className="product-row"><div className="product-photo">{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt={`Foto ${product.name}`} loading="lazy" /> : <span>Tanpa foto</span>}</div><div className="product-description"><strong>{product.name}</strong><span>{product.category_name} · {product.sku || 'Tanpa SKU'}</span>{Number(product.variant_count) > 0 && <div className="variant-summary"><span>{product.variant_count} varian</span>{String(product.variant_colors || '').split('|').filter(Boolean).slice(0, 4).map((color) => <i key={color} title={color}>{color}</i>)}</div>}<div className="product-actions"><a className="edit-link" href={`/products/${product.id}/edit`}>Kelola produk</a></div></div><div><strong>Rp{Number(product.price).toLocaleString('id-ID')}</strong><span>Stok {product.stock}</span></div></article>)}{!products.length && <div className="empty-state"><strong>Produk tidak ditemukan.</strong><span>Coba kata kunci lain atau tambahkan produk baru.</span><a href="/products/new">Tambah produk</a></div>}</div>}
    </section>
  </AppShell>;
}
