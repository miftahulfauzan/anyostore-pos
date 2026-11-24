'use client';
import { localDateString } from '../lib/local-date';
import SafeImage from '../components/SafeImage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSession } from '../components/AppStateProvider';
import { createPrintWindow } from '../lib/print-utils';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STOCK_PAGE_SIZE = 40;
const money = (v) => Number(v || 0).toLocaleString('id-ID');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));
const mediaUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = api.replace(/\/api\/?$/, '');
  return `${base}/${String(path).replace(/^\/+/, '')}`;
};

function groupStockRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = String(r.product_id);
    let group = map.get(key);
    if (!group) {
      group = { key, product_id: r.product_id, variant_id: null, name: r.product_name, sku: r.sku, photo_path: r.photo_path || '', min_stock: Number(r.min_stock || 0), qtyByWarehouse: {}, rackByWarehouse: {}, total: 0, reserved: 0 };
      map.set(key, group);
    }
    if (!group.photo_path && r.photo_path) group.photo_path = r.photo_path;
    group.qtyByWarehouse[String(r.warehouse_id)] = Number(r.quantity || 0);
    group.rackByWarehouse[String(r.warehouse_id)] = r.rack_position || '';
    group.total += Number(r.quantity || 0);
    group.reserved += Number(r.reserved || 0);
  }
  return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)) || Number(a.product_id) - Number(b.product_id));
}

function summarizeStockRows(groups, rows) {
  return {
    total_products: groups.length,
    total_stock: groups.reduce((sum, group) => sum + group.total, 0),
    total_branches: new Set(rows.map((row) => row.branch_name).filter(Boolean)).size,
    low_stock: groups.filter((group) => group.total > 0 && group.total <= group.min_stock).length,
    out_of_stock: groups.filter((group) => group.total === 0).length,
  };
}

// Laporan stok matriks: baris produk+warna, kolom per gudang, total di ujung.
export default function StockReportSection() {
  const { activeBranchId } = useAppSession();
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [allWarehouses, setAllWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [isGudang, setIsGudang] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingRack, setEditingRack] = useState(null);
  const [rackDraft, setRackDraft] = useState('');
  const [savingRack, setSavingRack] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [stockSummary, setStockSummary] = useState(null);
  const [pagination, setPagination] = useState({ limit: STOCK_PAGE_SIZE, offset: 0, total: 0, has_more: false });
  const loadSeq = useRef(0);

  const headers = () => ({ 'Content-Type': 'application/json'});

  function stockParams(offset = null) {
    const params = new URLSearchParams();
    if (cat) params.set('category_id', cat);
    if (q) params.set('search', q);
    if (isOwner || isGudang) {
      if (isOwner) params.set('branch_id', activeBranchId || 'all');
      else params.set('branch_id', branchId || 'all');
    }
    if (offset !== null) {
      params.set('limit', String(STOCK_PAGE_SIZE));
      params.set('offset', String(offset));
    }
    return params;
  }

  async function requestStock(params) {
    const response = await fetch(`${api}/inventory/stock-by-warehouse?${params}`, { headers: headers() });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.message || 'Data stok gagal dimuat');
    return body;
  }

  async function fetchAllStockRows() {
    const body = await requestStock(stockParams());
    return body.data || [];
  }

  useEffect(() => {
    fetch(`${api}/auth/me`, { headers: headers() })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); if (b?.data?.role === 'gudang') setIsGudang(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${api}/products/categories`, { headers: headers() }).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
      fetch(`${api}/settings/branches`, { headers: headers() }).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
      fetch(`${api}/inventory/warehouses/all`, { headers: headers() }).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
    ]).then(([cats, brs, whs]) => {
      setCategories(cats);
      setBranches((brs || []).filter((b) => b.is_active !== false));
      setAllWarehouses(whs || []);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    setLoadingMore(false);
    setMessage('');
    setWarehouseRows([]);
    setStockSummary(null);
    setPagination({ limit: STOCK_PAGE_SIZE, offset: 0, total: 0, has_more: false });
    const seq = ++loadSeq.current;
    requestStock(stockParams(0))
      .then((body) => {
        if (seq !== loadSeq.current) return;
        const nextRows = body.data || [];
        setWarehouseRows(nextRows);
        setStockSummary(body.summary || null);
        setPagination(body.pagination || { limit: STOCK_PAGE_SIZE, offset: 0, total: nextRows.length, has_more: false });
      })
      .catch((e) => { if (seq === loadSeq.current) setMessage(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [cat, q, branchId, activeBranchId, isOwner, isGudang]);

  const effectiveBranchId = isOwner
    ? (activeBranchId === 'all' ? '' : activeBranchId)
    : branchId;

  // Kolom gudang: dari daftar gudang aktif (lingkup pilihan) + gudang yang
  // muncul di data. Urut gudang utama dulu, sisanya abjad.
  const whColumns = useMemo(() => {
    const scoped = allWarehouses.filter((w) => !effectiveBranchId || String(w.branch_id) === String(effectiveBranchId));
    const byId = new Map(scoped.map((w) => [String(w.id), w]));
    for (const r of warehouseRows) {
      if (r.warehouse_id != null && !byId.has(String(r.warehouse_id))) {
        byId.set(String(r.warehouse_id), { id: r.warehouse_id, name: r.warehouse_name, type: null });
      }
    }
    return Array.from(byId.values()).sort((a, b) => (a.type === 'utama' ? 0 : 1) - (b.type === 'utama' ? 0 : 1) || String(a.name || '').localeCompare(String(b.name || '')));
  }, [allWarehouses, effectiveBranchId, warehouseRows]);

  // Baris: satu per produk (varian = pembeda gambar, bukan stok).
  const grouped = useMemo(() => groupStockRows(warehouseRows), [warehouseRows]);
  const visibleGroups = grouped;
  const calculatedSummary = useMemo(() => summarizeStockRows(grouped, warehouseRows), [grouped, warehouseRows]);
  const summary = stockSummary || calculatedSummary;

  const colSpan = 1 + whColumns.length + 1;

  async function loadMore() {
    if (loadingMore || !pagination.has_more) return;
    const seq = loadSeq.current;
    const offset = pagination.offset + pagination.limit;
    setLoadingMore(true);
    setMessage('');
    try {
      const body = await requestStock(stockParams(offset));
      if (seq !== loadSeq.current) return;
      setWarehouseRows((current) => [...current, ...(body.data || [])]);
      setPagination((current) => ({
        ...current,
        ...(body.pagination || {}),
        total: body.pagination?.total ?? current.total,
      }));
    } catch (error) {
      if (seq === loadSeq.current) setMessage(error.message);
    } finally {
      if (seq === loadSeq.current) setLoadingMore(false);
    }
  }

  async function exportCsv() {
    if (exportBusy || !summary.total_products) return;
    setExportBusy(true);
    setMessage('');
    try {
      const allRows = await fetchAllStockRows();
      const allGroups = groupStockRows(allRows);
      const header = ['Produk', ...whColumns.map((w) => w.name), 'Total'];
      const lines = allGroups.map((group) => [group.name, ...whColumns.map((w) => group.qtyByWarehouse[String(w.id)] || 0), group.total]);
      const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `laporan-stok-${localDateString()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setExportBusy(false);
    }
  }

  async function printPdf() {
    if (exportBusy || !summary.total_products) return;
    const printWindow = createPrintWindow();
    if (!printWindow) return;
    setExportBusy(true);
    setMessage('');
    try {
      const allRows = await fetchAllStockRows();
      const allGroups = groupStockRows(allRows);
      const allSummary = summarizeStockRows(allGroups, allRows);
      const mode = isOwner
        ? (activeBranchId === 'all' ? 'Semua Toko/Gudang' : 'Satu Toko/Gudang')
        : (branchId ? 'Satu Toko' : 'Semua Toko');
      const tableRows = allGroups.map((group) => `<tr><td><strong>${escapeHtml(group.name)}</strong>${group.sku ? `<br><small>${escapeHtml(group.sku)}</small>` : ''}</td>${whColumns.map((warehouse) => `<td class="number">${money(group.qtyByWarehouse[String(warehouse.id)] || 0)}</td>`).join('')}<td class="number"><strong>${money(group.total)}</strong></td></tr>`).join('');
      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Laporan Stok Produk</title><style>
        @page { size: A4 landscape; margin: 12mm; }
        body { margin: 0; color: #111827; font: 11px Arial, sans-serif; }
        header { margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #1e3a5f; }
        header strong { display: block; color: #1e3a5f; font-size: 13px; letter-spacing: 2px; }
        h1 { margin: 5px 0; font-size: 18px; }
        .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: #475569; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        thead { display: table-header-group; }
        th, td { padding: 6px 7px; border: 1px solid #cbd5e1; text-align: left; }
        th { background: #eef3f8; color: #1e3a5f; }
        td.number, th.number { text-align: right; white-space: nowrap; }
        small { color: #64748b; }
      </style></head><body><header><strong>ANYOSTORE</strong><h1>Laporan Stok Produk</h1><div class="meta"><span>Dicetak: ${escapeHtml(new Date().toLocaleString('id-ID'))}</span><span>Total Produk: ${money(allSummary.total_products)}</span><span>Total Stok: ${money(allSummary.total_stock)}</span><span>Mode: ${escapeHtml(mode)}</span></div></header><table><thead><tr><th>Produk</th>${whColumns.map((warehouse) => `<th class="number">${escapeHtml(warehouse.name)}</th>`).join('')}<th class="number">Total</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
      let printed = false;
      const triggerPrint = () => {
        if (printed || printWindow.closed) return;
        printed = true;
        printWindow.focus();
        printWindow.print();
      };
      printWindow.addEventListener('load', triggerPrint, { once: true });
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      window.setTimeout(triggerPrint, 500);
    } catch (error) {
      printWindow.close();
      setMessage(error.message);
    } finally {
      setExportBusy(false);
    }
  }

  function rackKey(product, warehouse) {
    return `${product.key}:${warehouse.id}`;
  }

  function beginRackEdit(product, warehouse) {
    setEditingRack(rackKey(product, warehouse));
    setRackDraft(product.rackByWarehouse[String(warehouse.id)] || '');
    setMessage('');
  }

  function cancelRackEdit() {
    setEditingRack(null);
    setRackDraft('');
  }

  async function saveRackPosition(product, warehouse) {
    setSavingRack(true);
    setMessage('');
    try {
      const response = await fetch(`${api}/inventory/stock-location`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          warehouse_id: Number(warehouse.id),
          product_id: Number(product.product_id),
          rack_position: rackDraft,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Posisi rak gagal disimpan');
      const saved = body.data?.rack_position || '';
      setWarehouseRows((current) => current.map((row) => (
        Number(row.product_id) === Number(product.product_id)
        && (row.variant_id == null ? null : Number(row.variant_id)) === (product.variant_id == null ? null : Number(product.variant_id))
        && Number(row.warehouse_id) === Number(warehouse.id)
          ? { ...row, rack_position: saved }
          : row
      )));
      cancelRackEdit();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingRack(false);
    }
  }

  function rackControl(product, warehouse, compact = false) {
    const key = rackKey(product, warehouse);
    const rack = product.rackByWarehouse[String(warehouse.id)] || '';
    if (editingRack === key) {
      return (
        <div className="rack-editor" onClick={(event) => event.stopPropagation()}>
          <input aria-label={`Posisi Rak ${product.name} di ${warehouse.name}`} title="Posisi Rak" value={rackDraft} maxLength={100} onChange={(event) => setRackDraft(event.target.value)} placeholder="Contoh A-01" onKeyDown={(event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); saveRackPosition(product, warehouse); } if (event.key === 'Escape') cancelRackEdit(); }} />
          <button type="button" className="small" disabled={savingRack} onClick={() => saveRackPosition(product, warehouse)}>{savingRack ? '…' : 'Simpan'}</button>
          <button type="button" className="small secondary" disabled={savingRack} onClick={cancelRackEdit}>Batal</button>
        </div>
      );
    }
    return (
      <div className={`rack-display${compact ? ' rack-display-compact' : ''}`}>
        <span>{rack ? `Rak: ${rack}` : 'Rak belum diatur'}</span>
        <button type="button" className="rack-edit-button" aria-label={`Edit posisi rak ${product.name} di ${warehouse.name}`} title="Edit posisi rak" onClick={() => beginRackEdit(product, warehouse)}>✎</button>
      </div>
    );
  }

  return (
    <section className="form-page" style={{ maxWidth: 1200 }}>
      <div className="panel">
        <div className="report-print-header">
          <div className="print-brand">
            <strong>ANYOSTORE</strong>
            <span>Laporan Stok Produk</span>
          </div>
          <div className="print-meta">
            <span>Dicetak: {new Date().toLocaleString('id-ID')}</span>
            <span>Total Produk: {summary.total_products}</span>
            <span>Total Stok: {money(summary.total_stock)}</span>
            <span>Mode: {isOwner ? (activeBranchId === 'all' ? 'Semua Toko/Gudang' : 'Satu Toko/Gudang') : (branchId ? 'Satu Toko' : 'Semua Toko')}</span>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ flex: 1 }} />
          <button type="button" className="button-link" onClick={exportCsv} disabled={exportBusy || loading || !Number(summary.total_products)}>{exportBusy ? 'Menyiapkan…' : 'Unduh Excel'}</button>
          <button type="button" className="button-link" onClick={printPdf} disabled={exportBusy || loading || !Number(summary.total_products)}>{exportBusy ? 'Menyiapkan…' : 'Unduh PDF'}</button>
        </div>

        {summary && (
          <div className="stock-summary-grid">
            <div className="stock-summary-item">
              <span className="stock-summary-label">Total Produk</span>
              <strong className="stock-summary-value">{money(summary.total_products)}</strong>
              {((isOwner && activeBranchId === 'all') || (isGudang && !branchId)) && (
                <small className="stock-summary-note">{summary.total_branches} toko/gudang</small>
              )}
            </div>
            <div className="stock-summary-item is-stock">
              <span className="stock-summary-label">Total Stok</span>
              <strong className="stock-summary-value">{money(summary.total_stock)}</strong>
            </div>
            <div className={`stock-summary-item${Number(summary.low_stock) > 0 ? ' is-alert' : ''}`}>
              <span className="stock-summary-label">Stok Rendah</span>
              <strong className="stock-summary-value">{money(summary.low_stock)}</strong>
            </div>
            <div className={`stock-summary-item${Number(summary.out_of_stock) > 0 ? ' is-alert' : ''}`}>
              <span className="stock-summary-label">Habis</span>
              <strong className="stock-summary-value">{money(summary.out_of_stock)}</strong>
            </div>
          </div>
        )}

        <div className="stock-filter-row no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Cari stok berdasarkan nama atau SKU" placeholder="Cari nama/SKU…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ flex: 1, minWidth: 180, minHeight: 40 }} />
          <select aria-label="Filter kategori" value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 150, minHeight: 40 }}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {isGudang && (
            <select aria-label={isGudang ? 'Filter gudang' : 'Filter toko'} value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ minWidth: 160, minHeight: 40 }}>
              <option value="">{isGudang ? 'Semua Gudang' : 'Semua Toko'}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>

        {message && <p className="message" role="status">{message}</p>}

        {/* Desktop & cetak: tabel matriks. Mobile: kartu (tanpa scroll samping). */}
        <div className="stock-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-md)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Produk</th>
                {whColumns.map((w) => <th key={w.id} style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{w.name}</th>)}
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={colSpan} style={{ padding: 10, color: 'var(--muted-foreground)' }}>Memuat…</td></tr>}
              {!loading && visibleGroups.map((g) => (
                <tr key={g.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', flex: '0 0 auto' }}>
                        <SafeImage src={g.photo_path ? mediaUrl(g.photo_path) : ''} alt={g.name} />
                      </div>
                      <span>{g.name}</span>
                    </div>
                  </td>
                  {whColumns.map((w) => <td key={w.id} style={{ padding: '8px 10px', textAlign: 'right' }}><strong>{money(g.qtyByWarehouse[String(w.id)] || 0)}</strong>{rackControl(g, w)}</td>)}
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(g.total)}</td>
                </tr>
              ))}
              {!loading && !grouped.length && (
                <tr><td colSpan={colSpan} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Belum ada stok tercatat.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="stock-cards-mobile">
          {loading && <p className="muted">Memuat…</p>}
          {!loading && visibleGroups.map((g) => (
            <article key={g.key} className="stock-card" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fff' }}>
              <div className="stock-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', flex: '0 0 auto' }}>
                    <SafeImage src={g.photo_path ? mediaUrl(g.photo_path) : ''} alt={g.name} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14, display: 'block' }}>{g.name}</strong>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted-foreground)' }}>{g.sku || ''}</span>
                  </div>
                </div>
                <strong style={{ fontSize: 16, color: '#1e3a5f', whiteSpace: 'nowrap' }}>{money(g.total)}</strong>
              </div>
              <div className="stock-card-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {whColumns.map((w) => {
                      const qty = g.qtyByWarehouse[String(w.id)] || 0;
                      return (
                        <div key={w.id} style={{ padding: '5px 8px', borderRadius: 8, background: qty > 0 ? '#eef2ff' : '#f1f5f9', color: qty > 0 ? '#1e3a5f' : '#94a3b8', fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                          {w.name}: {money(qty)}{rackControl(g, w, true)}
                        </div>
                      );
                    })}
              </div>
            </article>
          ))}
          {!loading && !grouped.length && <p className="muted">Belum ada stok tercatat.</p>}
        </div>
        {!loading && pagination.has_more && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 4px' }}>
            <button type="button" className="secondary" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Memuat…' : `Tampilkan ${Math.min(STOCK_PAGE_SIZE, pagination.total - grouped.length)} produk lagi (${grouped.length}/${pagination.total})`}
            </button>
          </div>
        )}
      </div>
      <style>{`
        .report-print-header { display: none; }
        .stock-cards-mobile { display: none; }
        .rack-display { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 3px; color: var(--muted-foreground); font-size: 10px; font-weight: 400; white-space: nowrap; }
        .rack-display-compact { justify-content: flex-start; margin-top: 3px; font-size: 10px; }
        .rack-edit-button { border: 0; background: transparent; color: var(--primary); cursor: pointer; padding: 0 2px; line-height: 1; font-size: 15px; }
        .rack-editor { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; }
        .rack-editor input { width: 100px; min-width: 0; min-height: 28px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 5px; font-size: 11px; }
        .rack-editor .small { min-height: 28px; padding: 3px 6px; font-size: 10px; }
        @media (max-width: 900px) {
          .stock-table-wrap { display: none; }
          .stock-cards-mobile { display: grid; gap: 10px; }
        }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { width: auto !important; }
          .report-print-header { display: block; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; }
          .print-brand strong { display: block; font-size: 14px; letter-spacing: .14em; color: #1e3a5f; }
          .print-brand span { display: block; font-size: 18px; font-weight: 700; margin-top: 2px; color: #111827; }
          .print-meta { display: flex; flex-wrap: wrap; gap: 3px 16px; margin-top: 6px; font-size: 10px; color: #374151; }
          .no-print { display: none !important; }
          .stock-table-wrap { display: block !important; }
          .stock-cards-mobile { display: none !important; }
          body * { visibility: visible !important; }
          .app-shell, .app-main { display: block !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .app-shell, .app-main, .app-content, .app-shell > div { display: block !important; width: 100% !important; }
          .app-content { padding: 0 !important; }
          .app-content > div { display: block !important; width: 100% !important; max-width: none !important; }
          .sidebar, .app-header { display: none !important; }
          .form-page { max-width: none !important; }
          .panel { border: none !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 9px !important; }
          th { background: #1e3a5f !important; color: #fff !important; padding: 4px 6px !important; text-align: left !important; font-size: 9px !important; white-space: nowrap !important; }
          td { padding: 4px 6px !important; border-bottom: 1px solid #e5e7eb !important; vertical-align: top !important; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </section>
  );
}
