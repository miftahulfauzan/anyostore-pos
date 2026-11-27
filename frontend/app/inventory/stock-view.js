'use client';
import { localDateString } from '../lib/local-date';
import SafeImage from '../components/SafeImage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAppSession } from '../components/AppStateProvider';
import { createPrintWindow } from '../lib/print-utils';
import { stockStatus } from './stock-status.mjs';

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

function stockStatusLabel(group) {
  const status = stockStatus(group);
  return status === 'out' ? 'Habis' : status === 'low' ? 'Menipis' : 'Aman';
}

function applyStockView(groups, statusFilter, sortBy) {
  const filtered = groups.filter((group) => (
    statusFilter === 'all' || stockStatus(group) === statusFilter
  ));
  return filtered.sort((a, b) => {
    if (sortBy === 'stock_asc' && a.total !== b.total) return a.total - b.total;
    if (sortBy === 'stock_desc' && a.total !== b.total) return b.total - a.total;
    if (sortBy === 'name_desc') return String(b.name).localeCompare(String(a.name)) || Number(a.product_id) - Number(b.product_id);
    return String(a.name).localeCompare(String(b.name)) || Number(a.product_id) - Number(b.product_id);
  });
}

function summarizeStockRows(groups, rows) {
  return {
    total_products: groups.length,
    total_stock: groups.reduce((sum, group) => sum + group.total, 0),
    total_branches: new Set(rows.map((row) => row.branch_name).filter(Boolean)).size,
    low_stock: groups.filter((group) => stockStatus(group) === 'low').length,
    out_of_stock: groups.filter((group) => stockStatus(group) === 'out').length,
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [isOwner, setIsOwner] = useState(false);
  const [isGudang, setIsGudang] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [printDate, setPrintDate] = useState('');
  const [editingRack, setEditingRack] = useState(null);
  const [rackDraft, setRackDraft] = useState('');
  const [savingRack, setSavingRack] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [stockSummary, setStockSummary] = useState(null);
  const [pagination, setPagination] = useState({ limit: STOCK_PAGE_SIZE, offset: 0, total: 0, has_more: false });
  const loadSeq = useRef(0);
  const needsFullDataset = statusFilter !== 'all' || sortBy !== 'name';

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
    setPrintDate(new Date().toLocaleString('id-ID'));
    const updatePrintDate = () => flushSync(() => setPrintDate(new Date().toLocaleString('id-ID')));
    window.addEventListener('beforeprint', updatePrintDate);
    return () => window.removeEventListener('beforeprint', updatePrintDate);
  }, []);

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
    requestStock(stockParams(needsFullDataset ? null : 0))
      .then((body) => {
        if (seq !== loadSeq.current) return;
        const nextRows = body.data || [];
        const nextGroups = groupStockRows(nextRows);
        const nextSummary = body.summary || summarizeStockRows(nextGroups, nextRows);
        setWarehouseRows(nextRows);
        setStockSummary(nextSummary);
        setPagination(body.pagination || { limit: STOCK_PAGE_SIZE, offset: 0, total: nextSummary.total_products, has_more: false });
      })
      .catch((e) => { if (seq === loadSeq.current) setMessage(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [cat, q, branchId, activeBranchId, isOwner, isGudang, needsFullDataset]);

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
  const visibleGroups = useMemo(() => applyStockView(grouped, statusFilter, sortBy), [grouped, statusFilter, sortBy]);
  const calculatedSummary = useMemo(() => summarizeStockRows(grouped, warehouseRows), [grouped, warehouseRows]);
  const summary = stockSummary || calculatedSummary;
  const printSummary = summarizeStockRows(visibleGroups, warehouseRows);
  const summaryTotal = Number(summary.total_products || 0);
  const lowCount = Number(summary.low_stock || 0);
  const outCount = Number(summary.out_of_stock || 0);
  const safeCount = Math.max(0, summaryTotal - lowCount - outCount);
  const statusDenominator = Math.max(1, summaryTotal);
  const safeShare = `${(safeCount / statusDenominator) * 100}%`;
  const lowShare = `${(lowCount / statusDenominator) * 100}%`;
  const scopeLabel = isOwner
    ? (activeBranchId === 'all' ? 'Semua toko & gudang' : 'Toko aktif')
    : isGudang
      ? (branchId ? 'Gudang terpilih' : 'Semua gudang')
      : 'Cabang aktif';

  const colSpan = 1 + whColumns.length + 2;

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
    if (exportBusy || !summary.total_products || !visibleGroups.length) return;
    setExportBusy(true);
    setMessage('');
    try {
      const allRows = await fetchAllStockRows();
      const allGroups = applyStockView(groupStockRows(allRows), statusFilter, sortBy);
      const header = ['Produk', ...whColumns.map((w) => w.name), 'Total', 'Status'];
      const lines = allGroups.map((group) => [group.name, ...whColumns.map((w) => group.qtyByWarehouse[String(w.id)] || 0), group.total, stockStatusLabel(group)]);
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
    if (exportBusy || !summary.total_products || !visibleGroups.length) return;
    const printWindow = createPrintWindow();
    if (!printWindow) return;
    setExportBusy(true);
    setMessage('');
    try {
      const allRows = await fetchAllStockRows();
      const allGroups = applyStockView(groupStockRows(allRows), statusFilter, sortBy);
      const allSummary = summarizeStockRows(allGroups, allRows);
      const mode = isOwner
        ? (activeBranchId === 'all' ? 'Semua Toko/Gudang' : 'Satu Toko/Gudang')
        : (branchId ? 'Satu Toko' : 'Semua Toko');
      const tableRows = allGroups.map((group) => {
        const status = stockStatus(group);
        return `<tr><td><strong>${escapeHtml(group.name)}</strong>${group.sku ? `<br><small>${escapeHtml(group.sku)}</small>` : ''}</td><td><span class="stock-status ${status}">${stockStatusLabel(group)}</span></td>${whColumns.map((warehouse) => `<td class="number">${money(group.qtyByWarehouse[String(warehouse.id)] || 0)}</td>`).join('')}<td class="number"><strong>${money(group.total)}</strong></td></tr>`;
      }).join('');
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
        .stock-status { display: inline-block; padding: 3px 7px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .stock-status.safe { background: #e5f5ed; color: #176443; }
        .stock-status.low { background: #fff1d8; color: #88530d; }
        .stock-status.out { background: #fde8e7; color: #9f3028; }
        small { color: #64748b; }
      </style></head><body><header><strong>ANYOSTORE</strong><h1>Laporan Stok Produk</h1><div class="meta"><span>Dicetak: ${escapeHtml(new Date().toLocaleString('id-ID'))}</span><span>Total Produk: ${money(allSummary.total_products)}</span><span>Total Stok: ${money(allSummary.total_stock)}</span><span>Mode: ${escapeHtml(mode)}</span></div></header><table><thead><tr><th>Produk</th><th>Status</th>${whColumns.map((warehouse) => `<th class="number">${escapeHtml(warehouse.name)}</th>`).join('')}<th class="number">Total</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
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
    if (!Object.hasOwn(product.qtyByWarehouse, String(warehouse.id))) return null;
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
            <span>Dicetak: {printDate}</span>
            <span>Total Produk: {printSummary.total_products}</span>
            <span>Total Stok: {money(printSummary.total_stock)}</span>
            <span>Mode: {isOwner ? (activeBranchId === 'all' ? 'Semua Toko/Gudang' : 'Satu Toko/Gudang') : (branchId ? 'Satu Toko' : 'Semua Toko')}</span>
          </div>
        </div>

        <section className="stock-overview-hero no-print" aria-label="Ringkasan stok">
          <div className="stock-overview-copy">
            <span className="stock-overview-eyebrow">STOK TERSEDIA · {scopeLabel}</span>
            <div className="stock-overview-total">
              <strong>{money(summary.total_stock)}</strong>
              <span>pcs total stok</span>
            </div>
            <div className="stock-overview-product-count">
              <strong>{money(summary.total_products)}</strong>
              <span>produk terpantau</span>
            </div>
            {((isOwner && activeBranchId === 'all') || (isGudang && !branchId)) && (
              <small className="stock-overview-scope-note">{money(summary.total_branches)} toko/gudang dalam cakupan</small>
            )}
          </div>
          <div className="stock-overview-chart">
            <div
              className="stock-status-donut"
              role="img"
              aria-label={`${money(safeCount)} aman, ${money(lowCount)} menipis, ${money(outCount)} habis`}
              data-empty={summaryTotal === 0 ? 'true' : 'false'}
              style={{ '--safe-share': safeShare, '--low-share': lowShare }}
            >
              <span>{money(summary.total_products)}</span>
              <small>produk</small>
            </div>
            <div className="stock-status-legend" aria-label="Ringkasan kondisi stok">
              <div data-stock-status="safe"><i /> <span>Aman</span><strong>{money(safeCount)}</strong></div>
              <div data-stock-status="low"><i /> <span>Menipis</span><strong>{money(lowCount)}</strong></div>
              <div data-stock-status="out"><i /> <span>Habis</span><strong>{money(outCount)}</strong></div>
            </div>
          </div>
        </section>

        <div className="stock-toolbar no-print">
          <div className="stock-status-filter" role="group" aria-label="Filter status produk">
            <button type="button" className={statusFilter === 'all' ? 'is-active' : ''} aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Semua</button>
            <button type="button" className={statusFilter === 'low' ? 'is-active' : ''} data-stock-status="low" aria-pressed={statusFilter === 'low'} onClick={() => setStatusFilter('low')}>Menipis</button>
            <button type="button" className={statusFilter === 'out' ? 'is-active' : ''} data-stock-status="out" aria-pressed={statusFilter === 'out'} onClick={() => setStatusFilter('out')}>Habis</button>
          </div>
          <input className="stock-search" aria-label="Cari stok berdasarkan nama atau SKU" placeholder="Cari nama/SKU…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <div className="stock-desktop-controls">
            <select aria-label="Filter kategori" className="stock-select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select aria-label="Urutkan stok" className="stock-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Nama A–Z</option>
              <option value="name_desc">Nama Z–A</option>
              <option value="stock_asc">Stok terendah</option>
              <option value="stock_desc">Stok tertinggi</option>
            </select>
            {isGudang && (
              <select aria-label="Filter gudang" className="stock-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Semua gudang</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button type="button" className="stock-export-button" onClick={exportCsv} disabled={exportBusy || loading || !visibleGroups.length}>{exportBusy ? 'Menyiapkan…' : 'Unduh Excel'}</button>
            <button type="button" className="stock-export-button secondary" onClick={printPdf} disabled={exportBusy || loading || !visibleGroups.length}>{exportBusy ? 'Menyiapkan…' : 'Unduh PDF'}</button>
          </div>
          <details className="stock-mobile-controls">
            <summary aria-label="Buka filter dan tindakan stok">⋯</summary>
            <div className="stock-mobile-controls-panel">
              <label>Urutkan
                <select aria-label="Urutkan stok" className="stock-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="name">Nama A–Z</option>
                  <option value="name_desc">Nama Z–A</option>
                  <option value="stock_asc">Stok terendah</option>
                  <option value="stock_desc">Stok tertinggi</option>
                </select>
              </label>
              <label>Kategori
                <select aria-label="Filter kategori" className="stock-select" value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">Semua kategori</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {isGudang && (
                <label>Gudang
                  <select aria-label="Filter gudang" className="stock-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">Semua gudang</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
              <div className="stock-mobile-exports">
                <button type="button" className="stock-export-button" onClick={exportCsv} disabled={exportBusy || loading || !visibleGroups.length}>{exportBusy ? 'Menyiapkan…' : 'Unduh Excel'}</button>
                <button type="button" className="stock-export-button secondary" onClick={printPdf} disabled={exportBusy || loading || !visibleGroups.length}>{exportBusy ? 'Menyiapkan…' : 'Unduh PDF'}</button>
              </div>
            </div>
          </details>
        </div>

        {message && <p className="message" role="status">{message}</p>}

        {/* Desktop & cetak: tabel matriks. PWA: baris stok yang mudah dipindai. */}
        <div className="stock-table-wrap">
          <table className="stock-matrix">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th>Produk</th>
                <th>Status</th>
                {whColumns.map((w) => <th key={w.id} className="is-number">{w.name}</th>)}
                <th className="is-number">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={colSpan}>Memuat…</td></tr>}
              {!loading && visibleGroups.map((g) => (
                <tr key={g.key}>
                  <td>
                    <div className="stock-matrix-product">
                      <div className="stock-matrix-photo">
                        <SafeImage src={g.photo_path ? mediaUrl(g.photo_path) : ''} alt={g.name} />
                      </div>
                      <div><strong>{g.name}</strong>{g.sku && <small>{g.sku}</small>}</div>
                    </div>
                  </td>
                  <td><span className="stock-status-badge" data-stock-status={stockStatus(g)}>{stockStatusLabel(g)}</span></td>
                  {whColumns.map((w) => <td key={w.id} className="is-number"><strong>{money(g.qtyByWarehouse[String(w.id)] || 0)}</strong>{rackControl(g, w)}</td>)}
                  <td className="is-number"><strong>{money(g.total)}</strong></td>
                </tr>
              ))}
              {!loading && !visibleGroups.length && (
                <tr><td colSpan={colSpan} className="stock-empty-cell">{statusFilter !== 'all' ? 'Tidak ada produk pada status ini.' : (q || cat) ? 'Produk tidak ditemukan dalam cakupan ini.' : 'Belum ada stok tercatat.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="stock-product-list">
          {loading && <p className="muted">Memuat…</p>}
          {!loading && visibleGroups.map((g) => (
            <article key={g.key} className="stock-product-row" data-stock-status={stockStatus(g)}>
              <div className="stock-product-main">
                <div className="stock-product-identity">
                  <div className="stock-product-photo">
                    <SafeImage src={g.photo_path ? mediaUrl(g.photo_path) : ''} alt={g.name} />
                  </div>
                  <div className="stock-product-copy">
                    <strong>{g.name}</strong>
                    {g.sku && <small>{g.sku}</small>}
                    <span className="stock-status-badge" data-stock-status={stockStatus(g)}>{stockStatusLabel(g)}</span>
                  </div>
                </div>
                <div className="stock-product-total"><strong>{money(g.total)}</strong><span>pcs</span></div>
              </div>
              <div className="stock-warehouse-details">
                {whColumns.map((w) => (
                  <div key={w.id} className="stock-warehouse-row">
                    <span>{w.name}</span>
                    <strong>{money(g.qtyByWarehouse[String(w.id)] || 0)} pcs</strong>
                    {rackControl(g, w, true)}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!loading && !visibleGroups.length && <p className="stock-empty-message">{statusFilter !== 'all' ? 'Tidak ada produk pada status ini.' : (q || cat) ? 'Produk tidak ditemukan dalam cakupan ini.' : 'Belum ada stok tercatat.'}</p>}
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
        .rack-display { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 3px; color: var(--muted-foreground); font-size: 10px; font-weight: 400; white-space: nowrap; }
        .rack-display-compact { justify-content: flex-start; margin-top: 3px; font-size: 10px; }
        .rack-edit-button { border: 0; background: transparent; color: var(--primary); cursor: pointer; padding: 0 2px; line-height: 1; font-size: 15px; }
        .rack-editor { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; }
        .rack-editor input { width: 100px; min-width: 0; min-height: 28px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 5px; font-size: 11px; }
        .rack-editor .small { min-height: 28px; padding: 3px 6px; font-size: 10px; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { width: auto !important; }
          .report-print-header { display: block; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; }
          .print-brand strong { display: block; font-size: 14px; letter-spacing: .14em; color: #1e3a5f; }
          .print-brand span { display: block; font-size: 18px; font-weight: 700; margin-top: 2px; color: #111827; }
          .print-meta { display: flex; flex-wrap: wrap; gap: 3px 16px; margin-top: 6px; font-size: 10px; color: #374151; }
          .no-print { display: none !important; }
          .stock-table-wrap { display: block !important; }
          .stock-product-list { display: none !important; }
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
