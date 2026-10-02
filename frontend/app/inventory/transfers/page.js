'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession, useUnsavedWork } from '../../components/AppStateProvider';
import SafeImage from '../../components/SafeImage';
import StockVariantPicker from '../../components/StockVariantPicker';
import transferDefaults from './transfer-defaults.cjs';
import transferLabels from './transfer-labels.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const mediaUrl = (p) => (p ? api.replace('/api', '') + p : '');
const { selectTransferDefaults } = transferDefaults;
const { formatHistoryLocationLabel, formatTransferLocationLabel } = transferLabels;

const transferStatusLabels = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function TransferHistory({
  rows,
  loading,
  message,
  total,
  limit,
  page,
  filters,
  setFilters,
  onApply,
  onRefresh,
  onPage,
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="transfer-history-page">
      <form className="panel transfer-history-filter" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
        <div className="transfer-history-filter-heading">
          <div>
            <h2>Riwayat Transfer</h2>
            <p className="muted">Lihat alur stok dari lokasi asal ke lokasi tujuan berdasarkan transaksi yang tersimpan.</p>
          </div>
          <button type="button" className="secondary" onClick={onRefresh} disabled={loading}>Muat ulang</button>
        </div>
        <div className="transfer-history-filter-grid">
          <label>Tanggal mulai
            <input type="date" value={filters.start} onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))} />
          </label>
          <label>Tanggal akhir
            <input type="date" value={filters.end} onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))} />
          </label>
          <label>Arah transfer
            <select value={filters.direction} onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value }))}>
              <option value="">Semua arah</option>
              <option value="outgoing">Keluar dari cabang</option>
              <option value="incoming">Masuk ke cabang</option>
            </select>
          </label>
          <label>Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Semua status</option>
              <option value="completed">Selesai</option>
              <option value="pending">Menunggu</option>
              <option value="approved">Disetujui</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </label>
          <label className="transfer-history-search">Cari produk atau SKU
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Contoh: AT67 atau denim" />
          </label>
          <div className="transfer-history-filter-actions">
            <button type="submit" disabled={loading}>{loading ? 'Memuat…' : 'Terapkan filter'}</button>
          </div>
        </div>
      </form>

      {message && <p className="message" role="alert">{message}</p>}
      {loading && <section className="panel transfer-history-state"><p className="muted">Memuat riwayat transfer…</p></section>}
      {!loading && !rows.length && <section className="panel transfer-history-state"><strong>Belum ada riwayat transfer.</strong><p className="muted">Coba ubah rentang tanggal atau filter pencarian.</p></section>}
      {!loading && rows.length > 0 && (
        <div className="transfer-history-list">
          {rows.map((row) => {
            const source = row.source || {};
            const destination = row.destination || {};
            const fromLines = row.details?.from || [];
            const toLines = row.details?.to || [];
            const status = transferStatusLabels[row.status] || row.status || 'Tidak diketahui';
            const sourceLabel = formatHistoryLocationLabel(source);
            const destinationLabel = formatHistoryLocationLabel(destination);
            return (
              <article key={row.id} className="transfer-history-card">
                <div className="transfer-history-card-heading">
                  <div className="transfer-history-card-meta">
                    <div className="transfer-history-number-row">
                      <span className={`transfer-history-status status-${row.status || 'unknown'}`}>{status}</span>
                      <strong>{row.number}</strong>
                    </div>
                    <span className="muted">{formatHistoryDate(row.created_at)} · Admin: {row.admin}</span>
                  </div>
                  <div className="transfer-history-total">
                    <strong>{formatNumber(row.total_qty)} pcs</strong>
                    <span>{formatNumber(row.product_count)} produk</span>
                  </div>
                </div>

                <div className="transfer-history-route">
                  <div className="transfer-history-route-side">
                    <span className="transfer-history-route-label">Dari</span>
                    <strong>{sourceLabel}</strong>
                  </div>
                  <span className="transfer-history-route-arrow" aria-hidden="true">→</span>
                  <div className="transfer-history-route-side destination">
                    <span className="transfer-history-route-label">Ke</span>
                    <strong>{destinationLabel}</strong>
                  </div>
                </div>

                {row.notes && <p className="transfer-history-note"><strong>Keterangan:</strong> {row.notes}</p>}
                <details className="transfer-history-details">
                  <summary>Lihat rincian barang</summary>
                  <div className="transfer-history-detail-grid">
                    <TransferDetailColumn title={`Keluar dari ${source.warehouse_name || 'lokasi asal'}`} lines={fromLines} />
                    <TransferDetailColumn title={`Masuk ke ${destination.warehouse_name || 'lokasi tujuan'}`} lines={toLines} />
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="transfer-history-pagination" aria-label="Paginasi riwayat transfer">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
          <span>Halaman {page} dari {totalPages}</span>
          <button type="button" className="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Berikutnya</button>
        </div>
      )}
    </section>
  );
}

function TransferDetailColumn({ title, lines }) {
  return (
    <section className="transfer-history-detail-column">
      <h3>{title}</h3>
      {!lines.length && <p className="muted">Rincian mutasi belum tersedia.</p>}
      {lines.map((line, index) => (
        <div className="transfer-history-detail-line" key={`${line.id || 'product'}-${line.variant_id || 'general'}-${index}`}>
          <div>
            <strong>{line.name}</strong>
            <span>{line.sku || 'Tanpa SKU'}{line.variant_color ? ` · ${line.variant_color}` : ''}</span>
            {line.stock_before !== null && line.stock_after !== null && <small>Stok {formatNumber(line.stock_before)} → {formatNumber(line.stock_after)}</small>}
          </div>
          <strong>{formatNumber(line.qty)} pcs</strong>
        </div>
      ))}
    </section>
  );
}

export default function TransferPage() {
  const { user, activeBranchId } = useAppSession();
  const [view, setView] = useState('create');
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoaded, setWarehousesLoaded] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [picker, setPicker] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ start: '', end: '', direction: '', status: '', search: '' });
  const [historyAppliedFilters, setHistoryAppliedFilters] = useState({ start: '', end: '', direction: '', status: '', search: '' });
  const h = () => ({ 'Content-Type': 'application/json'});
  useUnsavedWork('stock-transfer', cart.length > 0);

  const targets = useMemo(() => warehouses.filter((w) => String(w.id) !== String(from)), [warehouses, from]);
  const sourceWarehouses = useMemo(() => user?.role === 'owner' && activeBranchId && activeBranchId !== 'all'
    ? warehouses.filter((warehouse) => String(warehouse.branch_id) === String(activeBranchId))
    : user?.role === 'gudang'
      ? warehouses.filter((warehouse) => String(warehouse.branch_id) === String(user.branch_id))
      : warehouses, [warehouses, user?.role, user?.branch_id, activeBranchId]);
  const whLabel = formatTransferLocationLabel;

  async function loadProducts(warehouseId, warehouseList = warehouses) {
    if (!warehouseId) { setProducts([]); return; }
    try {
      const wh = warehouseList.find((w) => String(w.id) === String(warehouseId));
      const r = await fetch(`${api}/inventory/incoming/products?branch_id=${wh?.branch_id || ''}&warehouse_id=${warehouseId}`, { headers: h() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setProducts(b.data || []);
    } catch (e) { setMessage(e.message); }
  }

  const loadHistory = useCallback(async (filters, page) => {
    setHistoryLoading(true);
    setHistoryMessage('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (user?.role === 'owner' && activeBranchId) params.set('branch_id', activeBranchId);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const r = await fetch(`${api}/inventory-control/transfers/history?${params.toString()}`, { headers: { 'Content-Type': 'application/json' } });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || 'Riwayat transfer tidak dapat dimuat.');
      setHistoryRows(body.data || []);
      setHistoryTotal(Number(body.total || 0));
    } catch (error) {
      setHistoryRows([]);
      setHistoryTotal(0);
      setHistoryMessage(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.role, activeBranchId]);

  function changeView(nextView) {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === 'history') url.searchParams.set('view', 'history');
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', url);
    if (nextView === 'history') {
      setHistoryAppliedFilters(historyFilters);
      setHistoryPage(1);
    }
  }

  useEffect(() => {
    /* sesi via httpOnly cookie */
    Promise.all([
      fetch(api + '/inventory/warehouses/all', { headers: h() }).then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.message);
        return b.data || [];
      }),
    ]).then(([list]) => {
      setWarehouses(list);
      setWarehousesLoaded(true);
    }).catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    if (!warehousesLoaded || !user?.role) return;
    const isOwnerAll = user.role === 'owner' && (!activeBranchId || activeBranchId === 'all');
    const defaults = isOwnerAll
      ? { sourceId: '', targetId: '' }
      : selectTransferDefaults({
        role: user.role,
        branchId: user.role === 'owner' ? activeBranchId : user.branch_id,
        warehouses: sourceWarehouses,
      });
    setFrom(defaults.sourceId);
    setTo(defaults.targetId);
    setCart([]);
    setCartOpen(false);
    setProducts([]);
    if (defaults.sourceId) loadProducts(defaults.sourceId, warehouses);
    else setMessage(isOwnerAll
      ? 'Pilih toko/gudang di header, atau tentukan lokasi asal untuk transfer.'
      : 'Belum ada gudang aktif untuk transfer.');
  }, [warehousesLoaded, user?.role, user?.branch_id, activeBranchId, sourceWarehouses, warehouses]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'history') setView('history');
  }, []);

  useEffect(() => {
    if (view === 'history') loadHistory(historyAppliedFilters, historyPage);
  }, [view, historyAppliedFilters, historyPage, loadHistory]);

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
      setMessage(`Produk ${product.name} punya varian. Pilih warnanya dulu.`);
      return;
    }
    const key = `${product.id}:${variant?.id || 'umum'}`;
    setCart((cur) => {
      const found = cur.find((c) => c.key === key);
      if (found) return cur.map((c) => (c.key === key ? { ...c, quantity: c.quantity + qty } : c));
      return [...cur, { key, product_id: product.id, variant_id: variant?.id || null, name: product.name, sku: product.sku, color: variant?.color || null, quantity: qty }];
    });
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
    window.requestAnimationFrame(() => {
      const list = document.querySelector('#transfer-cart .mutasi-cart-list');
      if (list) list.scrollTop = 0;
    });

    const root = document.documentElement;
    const viewportProperties = [
      '--mutasi-cart-viewport-height',
      '--mutasi-cart-viewport-bottom',
      '--mutasi-cart-drawer-height',
    ];
    const previousProperties = viewportProperties.map((property) => root.style.getPropertyValue(property));

    function keepFocusedQuantityVisible() {
      const input = document.activeElement;
      if (!input?.classList?.contains('mutasi-cart-qty')) return;
      const list = input.closest('.mutasi-cart-list');
      const row = input.closest('.mutasi-cart-item');
      if (!list || !row) return;
      const listBounds = list.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom - listBounds.bottom + 8;
      else if (rowBounds.top < listBounds.top) list.scrollTop -= listBounds.top - rowBounds.top + 8;
    }

    function syncCartViewport() {
      const viewport = window.visualViewport;
      const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
      const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
      const bottom = Math.max(0, Math.round(window.innerHeight - height - top));
      root.style.setProperty('--mutasi-cart-viewport-height', `${height}px`);
      root.style.setProperty('--mutasi-cart-viewport-bottom', `${bottom}px`);
      root.style.setProperty('--mutasi-cart-drawer-height', `${Math.min(height * 0.78, 680)}px`);
      window.requestAnimationFrame(keepFocusedQuantityVisible);
    }

    syncCartViewport();
    window.addEventListener('resize', syncCartViewport);
    window.visualViewport?.addEventListener('resize', syncCartViewport);
    window.visualViewport?.addEventListener('scroll', syncCartViewport);
    return () => {
      document.body.classList.remove('mobile-cart-active');
      window.removeEventListener('resize', syncCartViewport);
      window.visualViewport?.removeEventListener('resize', syncCartViewport);
      window.visualViewport?.removeEventListener('scroll', syncCartViewport);
      viewportProperties.forEach((property, index) => {
        if (previousProperties[index]) root.style.setProperty(property, previousProperties[index]);
        else root.style.removeProperty(property);
      });
    };
  }, [cartOpen]);

  async function submit() {
    if (!from || !to || from === to) return setMessage('Pilih gudang asal dan tujuan yang berbeda.');
    const payload = cart.map((c) => ({ product_id: Number(c.product_id), variant_id: c.variant_id ? Number(c.variant_id) : undefined, quantity: Number(c.quantity) }));
    if (!payload.length) return setMessage('Belum ada produk di keranjang.');
    setSaving(true);
    setMessage('');
    try {
      const fromWh = warehouses.find((w) => String(w.id) === String(from));
      const toWh = warehouses.find((w) => String(w.id) === String(to));
      const isInter = fromWh && toWh && String(fromWh.branch_id) !== String(toWh.branch_id);
      const url = isInter ? api + '/inventory-control/transfers/inter-store' : api + '/inventory-control/transfers';
      const r = await fetch(url, { method: 'POST', headers: h(), body: JSON.stringify({ from_warehouse_id: Number(from), to_warehouse_id: Number(to), items: payload, notes }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Transfer stok berhasil (' + b.data.status + ').' + (b.data.auto_created ? ' Produk yang belum ada di tujuan dibuat otomatis.' : ''));
      setCart([]);
      setCartOpen(false);
      loadProducts(from);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title="Transfer Stok" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
    <div className="transfer-view-tabs" role="tablist" aria-label="Transfer stok">
      <button type="button" role="tab" aria-selected={view === 'create'} className={view === 'create' ? 'active' : 'secondary'} onClick={() => changeView('create')}>Buat transfer</button>
      <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : 'secondary'} onClick={() => changeView('history')}>Riwayat transfer</button>
    </div>

    {view === 'create' ? <>
    <section className="panel">
      <h2>Informasi Transfer</h2>
      <p className="muted">Stok asal berkurang, stok tujuan bertambah. Transfer antar cabang (owner) otomatis membuat produk yang belum ada di tujuan.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label>Dari (lokasi asal)
          <select required value={from} onChange={(e) => {
            const id = e.target.value;
            if (cart.length && !window.confirm('Keranjang transfer akan dikosongkan karena lokasi asal berubah. Lanjutkan?')) return;
            setFrom(id);
            setCart([]);
            setCartOpen(false);
            if (String(to) === String(id)) {
              const next = String(warehouses.find((w) => String(w.id) !== String(id))?.id || '');
              setTo(next);
            }
            loadProducts(id);
          }}>
            <option value="">Pilih lokasi asal…</option>
            {sourceWarehouses.map((w) => <option key={w.id} value={w.id}>{whLabel(w)}</option>)}
          </select>
        </label>
        <label>Ke (lokasi tujuan)
          <select required value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Pilih tujuan…</option>
            {targets.map((w) => <option key={w.id} value={w.id}>{whLabel(w)}</option>)}
          </select>
        </label>
        <label style={{ gridColumn: 'span 2' }}>Keterangan<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: kirim ke toko, mutasi pusat, retur reject…" /></label>
      </div>
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
            <article key={p.id} className="stock-picker-card" onClick={() => (p.variants && p.variants.length > 0 ? setPicker(p) : addToCart(p))} title={p.variants && p.variants.length > 0 ? 'Pilih varian & jumlah' : 'Klik untuk transfer stok umum'}>
              <div className="stock-picker-media">
                {p.photo_path
                  ? <SafeImage src={mediaUrl(p.photo_path)} alt={p.name} />
                  : <div className="stock-picker-ph">Tanpa foto</div>}
              </div>
              <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{p.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{p.sku || 'Tanpa SKU'}</span>
                <span className="stock-picker-badge">Stok asal: {Number(p.stock || 0)}</span>
                {p.rack_position && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Posisi Rak: {p.rack_position}</span>}
                {p.variants && p.variants.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                    {p.variants.map((v) => (
                      <button key={v.id} type="button" className="small secondary" title={`Stok ${v.color}: ${v.stock}${v.rack_position ? ` · Rak ${v.rack_position}` : ''}`} onClick={() => addToCart(p, v)}>{v.color} ({v.stock}){v.rack_position ? ` · ${v.rack_position}` : ''}</button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          {!visibleProducts.length && <p className="muted" style={{ gridColumn: '1/-1' }}>Tidak ada produk{query ? ` cocok dengan "${query}"` : ''}.</p>}
        </div>
      </section>

      <aside id="transfer-cart" className={`panel mutasi-cart${cartOpen ? ' open' : ''}`} aria-expanded={cartOpen}>
        <div className="mutasi-cart-header">
          <h2 style={{ margin: 0 }}>Keranjang Transfer</h2>
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
                onFocus={(e) => {
                  const input = e.currentTarget;
                  input.select();
                  window.setTimeout(() => {
                    const list = input.closest('.mutasi-cart-list');
                    const row = input.closest('.mutasi-cart-item');
                    if (!list || !row) return;
                    const listBounds = list.getBoundingClientRect();
                    const rowBounds = row.getBoundingClientRect();
                    if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom - listBounds.bottom + 8;
                    else if (rowBounds.top < listBounds.top) list.scrollTop -= listBounds.top - rowBounds.top + 8;
                  }, 100);
                }}
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
          <button className="mutasi-cart-submit" type="button" disabled={saving || !cart.length} onClick={submit}>{saving ? 'Memproses…' : 'Transfer Stok'}</button>
          {message && <p className="message" role="status">{message}</p>}
        </div>
      </aside>
    </div>
    {!cartOpen && cart.length > 0 && <button type="button" className="cart-fab" onClick={() => setCartOpen(true)} aria-expanded={cartOpen} aria-controls="transfer-cart"><span>Keranjang</span><strong>{cart.length} produk · {totalQty} pcs</strong></button>}
    {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)} aria-hidden="true" />}
    {picker && <StockVariantPicker product={picker} onClose={() => setPicker(null)} onAdd={(p, v, q) => { addToCart(p, v, q); setPicker(null); }} />}
    </> : <TransferHistory
      rows={historyRows}
      loading={historyLoading}
      message={historyMessage}
      total={historyTotal}
      limit={25}
      page={historyPage}
      filters={historyFilters}
      setFilters={setHistoryFilters}
      onApply={() => { setHistoryAppliedFilters(historyFilters); setHistoryPage(1); }}
      onRefresh={() => loadHistory(historyAppliedFilters, historyPage)}
      onPage={setHistoryPage}
    />}
  </AppShell>;
}
