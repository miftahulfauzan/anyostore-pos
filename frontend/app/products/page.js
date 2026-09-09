'use client';

import { useEffect, useRef, useState } from 'react';
import { Barcode, Copy, Pencil, Trash2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import BarcodeLabel from '../components/BarcodeLabel';
import { getProductSelectionPlacement } from './view-utils.cjs';
import { productsQuery, productBranchQuery, bulkDeleteProducts } from './catalog-state.cjs';
import { useAppSession } from '../components/AppStateProvider';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', sort: 'name', branchId: '', page: 1 });
  const { search, sort, branchId, page } = filters;
  const [view, setView] = useState('grid');
  const [branches, setBranches] = useState([]);
  const { user, resolved } = useAppSession();
  const isOwner = user?.role === 'owner';
  const isGudang = user?.role === 'gudang';
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const loadSeq = useRef(0);
  const [reload, setReload] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [mutating, setMutating] = useState(false);
  const mutationLock = useRef(false);
  const [failures, setFailures] = useState([]);

  function changeFilter(key, value) {
    ++loadSeq.current;
    setLoading(true);
    setProducts([]);
    setSelected(new Set());
    setFailures([]);
    setMessage('');
    setFilters((current) => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  }

  useEffect(() => {
    if (!resolved) return;
    const seq = ++loadSeq.current;
    const controller = new AbortController();
    setLoading(true);
    setProducts([]);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${apiUrl}/products?${productsQuery(filters)}`, { signal: controller.signal });
        const body = await response.json();
        if (seq !== loadSeq.current) return;
        if (!response.ok) throw new Error(body.message || 'Gagal memuat produk');
        const pages = Math.max(1, Number(body.totalPages) || 1);
        setProducts(body.data || []);
        setTotal(Number(body.total) || 0);
        setTotalPages(pages);
        if (filters.page > pages) setFilters((current) => ({ ...current, page: pages }));
      } catch (error) {
        if (seq === loadSeq.current && error.name !== 'AbortError') { setMessage(error.message); setTotal(0); }
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    }, 260);
    return () => { ++loadSeq.current; window.clearTimeout(timer); controller.abort(); };
  }, [filters, reload, resolved]);

  useEffect(() => {
    if (!isOwner && !isGudang) return;
    const controller = new AbortController();
    fetch(`${apiUrl}/settings/branches`, { signal: controller.signal })
      .then((r) => r.json())
      .then((b) => {
        const list = (b.data || []).filter((br) => br.is_active);
        setBranches(isGudang ? list.filter((br) => br.type === 'gudang') : list);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isOwner, isGudang]);

  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';

  async function copyProduct(product) {
    if (mutationLock.current || loading || !product.capabilities?.copy) return;
    if (!window.confirm(`Salin "${product.name}"? Varian, harga grosir, dan foto ikut disalin (stok mulai 0).`)) return;
    mutationLock.current = true;
    setMutating(true);
    try {
      const r = await fetch(`${apiUrl}/products/${product.id}/copy${productBranchQuery(product)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Produk disalin — cek daftar untuk edit SKU/barcode.');
      setReload((value) => value + 1);
    } catch (e) { setMessage(e.message); }
    finally { mutationLock.current = false; setMutating(false); }
  }

  async function deleteProduct(product) {
    if (mutationLock.current || loading || !product.capabilities?.delete) return;
    if (!window.confirm(`Hapus "${product.name}"? Produk dengan stok tersisa tidak dapat dihapus. Produk stok nol yang memiliki riwayat akan dinonaktifkan; produk kosong tanpa riwayat dihapus permanen.`)) return;
    mutationLock.current = true;
    setMutating(true);
    try {
      const r = await fetch(`${apiUrl}/products/${product.id}${productBranchQuery(product)}`, { method: 'DELETE', headers: {} });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.data.message);
      setSelected((previous) => new Set([...previous].filter((id) => id !== product.id)));
      setReload((value) => value + 1);
    } catch (e) { setMessage(e.message); }
    finally { mutationLock.current = false; setMutating(false); }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (deletableProducts.every((row) => prev.has(row.id)) ? new Set() : new Set(deletableProducts.map((p) => p.id))));
  }

  async function deleteSelected() {
    if (!selected.size || loading || mutationLock.current) return;
    if (selected.size > 200) { setMessage('Maksimal 200 produk dalam satu kali hapus. Kurangi pilihan dulu.'); return; }
    const count = selected.size;
    if (!window.confirm(`Hapus ${count} produk terpilih? Produk dengan stok tersisa ditolak. Produk stok nol dengan riwayat dinonaktifkan; produk kosong tanpa riwayat dihapus permanen.`)) return;
    mutationLock.current = true;
    setMutating(true);
    try {
      const result = await bulkDeleteProducts(products, [...selected], async (payload) => {
        const r = await fetch(`${apiUrl}/products/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
        const b = await r.json();
        if (!r.ok && !Array.isArray(b.data?.failed)) throw Object.assign(new Error(b.message || 'Gagal menghapus produk'), { status: r.status });
        return b.data;
      });
      setMessage(`${result.deleted} produk dihapus, ${result.deactivated} dinonaktifkan, ${result.failedIds.length} gagal.`);
      setFailures(result.failures.map((failure) => ({ ...failure, name: products.find((product) => product.id === failure.id)?.name || `Produk #${failure.id}` })));
      setSelected(new Set(result.failedIds));
      setReload((value) => value + 1);
    } catch (e) { setMessage(e.message); }
    finally { mutationLock.current = false; setMutating(false); }
  }

  const chosenBarcodes = Array.from({ length: Math.min(99, Number(barcodeCopies) || 1) }, () => barcodeProduct);
  const selectionPlacement = getProductSelectionPlacement(view);
  const deletableProducts = products.filter((product) => product.capabilities?.delete);

  return <AppShell title="Produk & Inventori" eyebrow="KATALOG PRODUK" actions={<><a className="button-link" href="/products/photos">Upload Foto Massal</a><a className="button-link" href="/products/new">Tambah Produk</a></>}>
    <section className="panel catalog-panel">
      <div className="section-heading" style={{ alignItems: 'center', marginBottom: 14 }}>
        <div><h2>Daftar Produk</h2><p>Cari nama, SKU, atau barcode. Kelola foto, video, varian, dan cetak barcode dari daftar ini.</p></div>
        <div className="catalog-view-controls">
          <span className="item-count">{loading ? 'Memuat…' : `${total} produk · ${products.length} ditampilkan`}</span>
          <select value={sort} disabled={mutating} onChange={(event) => changeFilter('sort', event.target.value)} aria-label="Urutkan produk" style={{ minHeight: 36, padding: '0 .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: '.82rem', fontWeight: 600 }}>
            <option value="name">Nama A-Z</option><option value="name_desc">Nama Z-A</option><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="price_asc">Harga termurah</option><option value="price_desc">Harga termahal</option><option value="stock_asc">Stok terendah</option><option value="stock_desc">Stok tertinggi</option>
          </select>
          <div className="view-segmented">
            <button type="button" className={view === 'grid' ? 'view-button selected' : 'view-button'} onClick={() => setView('grid')} aria-pressed={view === 'grid'}>Grid</button>
            <button type="button" className={view === 'list' ? 'view-button selected' : 'view-button'} onClick={() => setView('list')} aria-pressed={view === 'list'}>Daftar</button>
          </div>
        </div>
      </div>
      <div className="catalog-toolbar">
        <label>Cari produk<input type="search" value={search} disabled={mutating} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Nama, SKU, atau barcode" autoComplete="off" /></label>
        {(isOwner || isGudang) && (
          <label style={{ minWidth: 220 }}>{isGudang ? 'Gudang / Cabang' : 'Toko / Cabang'}<select value={branchId} disabled={mutating} onChange={(event) => changeFilter('branchId', event.target.value)}>
            <option value="">{isGudang ? 'Gudang saya' : 'Toko saya'}</option>
            <option value="all">{isGudang ? 'Semua Gudang' : 'Semua Toko / Gudang'}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        )}
      </div>
      <div className={selected.size > 0 ? 'selection-toolbar active' : 'selection-toolbar'}>
        <label style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem', fontWeight: 600, cursor: 'pointer', minHeight: 36 }}>
          <input type="checkbox" disabled={loading || mutating || !deletableProducts.length} checked={deletableProducts.length > 0 && deletableProducts.every((row) => selected.has(row.id))} onChange={toggleSelectAll} style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
          Pilih semua di halaman ini ({deletableProducts.length})
        </label>
        <span className="spacer" />
        {selected.size > 0 && (
          <>
          <span style={{ padding: '.32rem .65rem', borderRadius: 999, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap' }}>
            {selected.size} dipilih
          </span>
          <button type="button" className="small secondary" disabled={mutating} onClick={() => { setSelected(new Set()); setFailures([]); }} style={{ minHeight: 34 }}>Batalkan</button>
          <button type="button" className="small" disabled={loading || mutating} onClick={deleteSelected} style={{ minHeight: 34, background: '#dc2626', borderColor: '#dc2626', color: '#fff' }}>{mutating ? 'Memproses…' : 'Hapus terpilih'}</button>
          </>
        )}
      </div>
      {message && <p className="message" role="status">{message}</p>}
      {failures.length > 0 && <div className="catalog-failures" role="alert"><strong>Produk gagal tetap dipilih untuk dicoba lagi.</strong><ul>{failures.map((failure) => <li key={failure.id}>{failure.name}: {failure.message}{failure.status ? ` (${failure.status})` : ''}</li>)}</ul></div>}
      {loading ? <p>Memuat produk…</p> : <div className={`product-list ${view === 'grid' ? 'grid-view' : ''}`}>{products.map((product) => <article key={product.id} className="product-row" style={selected.has(product.id) ? { outline: '2px solid var(--primary)', outlineOffset: 2, borderRadius: 10 } : undefined}>
        {selectionPlacement === 'column' && <label className="product-select-control product-select-control--list" title="Pilih produk">
          <input type="checkbox" disabled={mutating || !product.capabilities?.delete} checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} aria-label={`Pilih ${product.name}`} />
        </label>}
        <div className="product-photo" style={{ position: 'relative' }}>{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt={`Foto ${product.name}`} loading="lazy" style={product.photo_transform ? (()=>{const t=(product.photo_transform||'').split(',').map(Number); return {objectFit:'cover',objectPosition:'center',transform:`translate(${t[1]||0}%,${t[2]||0}%) scale(${t[0]})`,width:'100%',height:'100%'};})():{}} /> : <span>Tanpa foto</span>}
          {selectionPlacement === 'thumbnail' && <label className="product-select-control" title="Pilih produk">
            <input type="checkbox" disabled={mutating || !product.capabilities?.delete} checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} aria-label={`Pilih ${product.name}`} />
          </label>}</div>
        <div className="product-description">
          <strong>{product.name}</strong>
          <span>{product.category_name} · {product.sku || 'Tanpa SKU'}</span>
          {Number(product.variant_count) > 0 && <div className="variant-summary"><span>{product.variant_count} varian</span>{String(product.variant_colors || '').split('|').filter(Boolean).slice(0, 4).map((color) => <i key={color} title={color}>{color}</i>)}</div>}
          <div className="product-actions">
            <button type="button" className="icon-action" aria-label={`Salin ${product.name}`} disabled={mutating || !product.capabilities?.copy} title={product.capabilities?.copy ? 'Salin produk' : 'Tidak memiliki izin salin di cabang produk ini'} onClick={() => copyProduct(product)}><Copy size={15} /></button>
            <button type="button" className="icon-action" title="Cetak barcode" aria-label={`Cetak barcode ${product.name}`} onClick={() => { setBarcodeProduct(product); setBarcodeCopies(1); }}><Barcode size={15} /></button>
            {product.capabilities?.edit && !mutating ? <a className="icon-action" title="Kelola produk" aria-label={`Kelola ${product.name}`} href={`/products/${product.id}/edit${productBranchQuery(product)}`}><Pencil size={15} /></a> : <button type="button" className="icon-action" disabled aria-label={`Kelola ${product.name}`} title="Tidak memiliki izin edit di cabang produk ini"><Pencil size={15} /></button>}
            <button type="button" className="icon-action danger" aria-label={`Hapus ${product.name}`} disabled={mutating || !product.capabilities?.delete} title={product.capabilities?.delete ? 'Hapus produk' : 'Tidak memiliki izin hapus di cabang produk ini'} onClick={() => deleteProduct(product)}><Trash2 size={15} /></button>
          </div>
          {(!product.capabilities?.edit || !product.capabilities?.copy || !product.capabilities?.delete) && <small className="product-permissions">Aksi yang redup tidak diizinkan untuk akun Anda di cabang produk ini.</small>}
        </div>
        <div><strong>Rp{Number(product.price).toLocaleString('id-ID')}</strong><span>Stok {product.stock}</span></div>
      </article>)}{!products.length && <div className="empty-state"><strong>Produk tidak ditemukan.</strong><span>Coba kata kunci lain atau tambahkan produk baru.</span><a href="/products/new">Tambah produk</a></div>}</div>}
      <nav className="catalog-pagination" aria-label="Paginasi produk">
        <button type="button" className="secondary" disabled={loading || mutating || page <= 1} onClick={() => changeFilter('page', page - 1)}>Sebelumnya</button>
        <span>Halaman {page} dari {totalPages}</span>
        <button type="button" className="secondary" disabled={loading || mutating || page >= totalPages} onClick={() => changeFilter('page', page + 1)}>Berikutnya</button>
      </nav>
    </section>

    {barcodeProduct && (
      <div onClick={() => setBarcodeProduct(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>Cetak Barcode — {barcodeProduct.name}</strong>
            <button type="button" onClick={() => setBarcodeProduct(null)} aria-label="Tutup" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', fontSize: 16, cursor: 'pointer', color: '#475569' }}>×</button>
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
