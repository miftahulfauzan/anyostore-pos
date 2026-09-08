'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import SafeImage from '../../components/SafeImage';
import StockVariantPicker from '../../components/StockVariantPicker';
import transferDefaults from './transfer-defaults.cjs';
import transferLabels from './transfer-labels.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const mediaUrl = (p) => (p ? api.replace('/api', '') + p : '');
const { selectTransferDefaults } = transferDefaults;
const { formatTransferLocationLabel } = transferLabels;

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
                    <strong>{source.branch_name || 'Cabang tidak tersedia'}</strong>
                    <span>{source.warehouse_name || 'Gudang tidak tersedia'}</span>
                  </div>
                  <span className="transfer-history-route-arrow" aria-hidden="true">→</span>
                  <div className="transfer-history-route-side destination">
                    <span className="transfer-history-route-label">Ke</span>
                    <strong>{destination.branch_name || 'Cabang tidak tersedia'}</strong>
                    <span>{destination.warehouse_name || 'Gudang tidak tersedia'}</span>
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
  const [view, setView] = useState('create');
  const [warehouses, setWarehouses] = useState([]);
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

  const targets = useMemo(() => warehouses.filter((w) => String(w.id) !== String(from)), [warehouses, from]);
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
  }, []);

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
      fetch(api + '/auth/me', { headers: h() }).then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.message);
        return b.data || null;
      }),
    ]).then(([list, user]) => {
      setWarehouses(list);
      const defaults = selectTransferDefaults({
        role: user?.role,
        branchId: user?.branch_id,
        warehouses: list,
      });
      setFrom(defaults.sourceId);
      setTo(defaults.targetId);
      if (defaults.sourceId) loadProducts(defaults.sourceId, list);
      else setMessage(user?.role === 'gudang'
        ? 'Cabang akun gudang belum memiliki gudang aktif.'
        : 'Belum ada gudang aktif.');
    }).catch((e) => setMessage(e.message));
  }, []);

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
  function setQty(key, value) {
    const q = Number(value);
    setCart((cur) => cur.flatMap((c) => (c.key === key ? (q > 0 ? [{ ...c, quantity: q }] : []) : [c])));
  }
  const totalQty = cart.reduce((s, c) => s + Number(c.quantity || 0), 0);

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
            setFrom(id);
            setCart([]);
            setCartOpen(false);
            if (String(to) === String(id)) {
              const next = String(warehouses.find((w) => String(w.id) !== String(id))?.id || '');
              setTo(next);
            }
            loadProducts(id);
          }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{whLabel(w)}</option>)}
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

      <aside className={`panel mutasi-cart${cartOpen ? ' open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Keranjang Transfer</h2>
          <button type="button" className="cart-close" onClick={() => setCartOpen(false)} aria-label="Tutup keranjang"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        {cart.length === 0 && <p className="muted" style={{ margin: '2px 0 10px', textAlign: 'center' }}>Belum ada produk di keranjang.</p>}
        {cart.map((c) => (
          <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13, display: 'block' }}>{c.name}</strong>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.sku}{c.color ? ` · ${c.color}` : ' · Stok umum'}</span>
            </div>
            <input type="number" min="1" value={c.quantity} onChange={(e) => setQty(c.key, e.target.value)} style={{ width: 64, minHeight: 34 }} />
            <button type="button" onClick={() => setQty(c.key, 0)} aria-label="Hapus" style={{ minWidth: 30, minHeight: 30 }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', fontWeight: 700 }}>
          <span>Total Qty</span><span>{totalQty}</span>
        </div>
        <button type="button" disabled={saving || !cart.length} onClick={submit} style={{ width: '100%' }}>{saving ? 'Memproses…' : 'Transfer Stok'}</button>
        {message && <p className="message" role="status" style={{ marginTop: 10 }}>{message}</p>}
      </aside>
    </div>
    {!cartOpen && <button type="button" className="cart-fab" onClick={() => setCartOpen(true)}>Keranjang · {totalQty} item</button>}
    {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)} />}
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
