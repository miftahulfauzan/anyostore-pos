'use client';
import { useEffect, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const money = (v) => Number(v || 0).toLocaleString('id-ID');

export default function StockReportSection() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [view, setView] = useState('produk');
  const [isOwner, setIsOwner] = useState(false);
  const [isGudang, setIsGudang] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const loadSeq = useRef(0);

  const token = () => localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

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
    ]).then(([cats, brs]) => {
      setCategories(cats);
      const list = brs || [];
      setBranches(list.filter((b) => b.is_active !== false));
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const seq = ++loadSeq.current;
    const params = {};
    if (cat) params.category_id = cat;
    if (q) params.search = q;
    if (isOwner || isGudang) {
      if (branchId) params.branch_id = branchId;
      else params.branch_id = 'all';
    }
    const qs = new URLSearchParams(params).toString();
    const endpoint = view === 'gudang' ? '/inventory/stock-by-warehouse' : '/inventory/stock-total';
    fetch(`${api}${endpoint}?${qs}`, { headers: headers() })
      .then((r) => r.json())
      .then((b) => {
        if (seq !== loadSeq.current) return;
        if (!b.success) throw new Error(b.message);
        if (view === 'gudang') {
          setWarehouseRows(b.data || []);
          setProducts([]);
          setSummary(null);
        } else {
          setProducts(b.data.products || []);
          setWarehouseRows([]);
          setSummary(b.data.summary || null);
        }
      })
      .catch((e) => { if (seq === loadSeq.current) setMessage(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [cat, q, branchId, isOwner, isGudang, view]);

  const showAll = (isOwner || isGudang) && !branchId;
  const statusLabel = (p) => {
    const stock = Number(p.total_stock || 0);
    const min = Number(p.min_stock || 0);
    return stock === 0 ? 'Habis' : stock <= min ? 'Rendah' : 'Aman';
  };

  function exportCsv() {
    const isGudang = view === 'gudang';
    const rows = isGudang ? warehouseRows : products;
    if (!rows.length) return;
    const header = isGudang
      ? (showAll ? ['Toko', 'Gudang', 'Produk', 'SKU', 'Warna', 'Stok', 'Reserved', 'Tersedia'] : ['Gudang', 'Produk', 'SKU', 'Warna', 'Stok', 'Reserved', 'Tersedia'])
      : (showAll ? ['Toko', 'Produk', 'SKU', 'Kategori', 'Warna', 'Min', 'Stok', 'Reserved', 'Tersedia', 'Status'] : ['Produk', 'SKU', 'Kategori', 'Warna', 'Min', 'Stok', 'Reserved', 'Tersedia', 'Status']);
    const lines = rows.map((r) => isGudang
      ? [...(showAll ? [r.branch_name || ''] : []), r.warehouse_name || '', r.product_name || '', r.sku || '', r.variant_color || '', r.quantity ?? 0, r.reserved ?? 0, Math.max(0, Number(r.quantity || 0) - Number(r.reserved || 0))]
      : [...(showAll ? [r.branch_name || ''] : []), r.name, r.sku || '', r.category_name || '', (r.colors || '').split('|').join(', '), r.min_stock ?? 0, r.total_stock ?? 0, r.reserved ?? 0, Math.max(0, Number(r.total_stock || 0) - Number(r.reserved || 0)), statusLabel(r)]);
    const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-stok-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="form-page" style={{ maxWidth: 1100 }}>
      <div className="panel">
        <div className="report-print-header">
          <div className="print-brand">
            <strong>ANYOSTORE</strong>
            <span>Laporan Stok {view === 'gudang' ? 'Per Gudang' : 'Per Produk'}</span>
          </div>
          <div className="print-meta">
            <span>Dicetak: {new Date().toLocaleString('id-ID')}</span>
            {summary && <span>Total Produk: {summary.total_products}</span>}
            {summary && <span>Total Stok: {summary.total_stock}</span>}
            <span>Mode: {showAll ? 'Semua Toko' : 'Satu Toko'}</span>
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setView('produk')} style={{ minHeight: 36, padding: '.4rem .7rem', borderRadius: 6, border: 'none', background: view === 'produk' ? '#1d5b43' : '#edf4ee', color: view === 'produk' ? '#fff' : '#174c35', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Per Produk</button>
          <button type="button" onClick={() => setView('gudang')} style={{ minHeight: 36, padding: '.4rem .7rem', borderRadius: 6, border: 'none', background: view === 'gudang' ? '#1d5b43' : '#edf4ee', color: view === 'gudang' ? '#fff' : '#174c35', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Per Gudang</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="button-link" onClick={exportCsv} disabled={!(view === 'gudang' ? warehouseRows.length : products.length)}>Unduh Excel</button>
          <button type="button" className="button-link" onClick={() => window.print()} disabled={!(view === 'gudang' ? warehouseRows.length : products.length)}>Unduh PDF</button>
        </div>

        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--muted)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Total Produk</p>
              <strong style={{ fontSize: 24 }}>{money(summary.total_products)}</strong>
              {showAll && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{summary.total_branches} toko</p>}
            </div>
            <div style={{ padding: 16, borderRadius: 8, background: 'var(--muted)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Total Stok</p>
              <strong style={{ fontSize: 24, color: 'var(--primary)' }}>{money(summary.total_stock)}</strong>
            </div>
            <div style={{ padding: 16, borderRadius: 8, background: summary.low_stock > 0 ? '#fef2f2' : 'var(--muted)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Stok Rendah</p>
              <strong style={{ fontSize: 24, color: summary.low_stock > 0 ? '#dc2626' : 'inherit' }}>{money(summary.low_stock)}</strong>
            </div>
            <div style={{ padding: 16, borderRadius: 8, background: summary.out_of_stock > 0 ? '#fef2f2' : 'var(--muted)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Habis</p>
              <strong style={{ fontSize: 24, color: summary.out_of_stock > 0 ? '#dc2626' : 'inherit' }}>{money(summary.out_of_stock)}</strong>
            </div>
          </div>
        )}

        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Cari nama/SKU…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180, minHeight: 40 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 150, minHeight: 40 }}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(isOwner || isGudang) && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ minWidth: 160, minHeight: 40 }}>
              <option value="">{isGudang ? 'Semua Gudang' : 'Semua Toko'}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>

        {message && <p className="message" role="status">{message}</p>}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                {showAll && <th style={{ padding: '8px 10px' }}>Toko</th>}
                <th style={{ padding: '8px 10px' }}>Produk</th>
                <th style={{ padding: '8px 10px' }}>SKU</th>
                <th style={{ padding: '8px 10px' }}>Kategori</th>
                <th style={{ padding: '8px 10px' }}>Warna</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Min</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stok</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Reserved</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tersedia</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={showAll ? 10 : 9} style={{ padding: 10, color: 'var(--muted-foreground)' }}>Memuat…</td></tr>
              ))}
              {!loading && products.map((p) => {
                const stock = Number(p.total_stock || 0);
                const min = Number(p.min_stock || 0);
                const reserved = Number(p.reserved || 0);
                const available = stock - reserved;
                const colors = (p.colors || '').split('|').filter(Boolean);
                const isLow = stock > 0 && stock <= min;
                const isOut = stock === 0;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: isOut ? '#fef2f2' : isLow ? '#fffbeb' : 'transparent' }}>
                    {showAll && <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{p.branch_name || '-'}</td>}
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted-foreground)' }}>{p.sku || '-'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>{p.category_name || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {colors.map((c) => <span key={c} style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--muted)', fontSize: 10 }}>{c}</span>)}
                        {!colors.length && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>-</span>}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(min)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(stock)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--muted-foreground)' }}>{money(reserved)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{money(available)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {isOut ? <span className="status pending">Habis</span> : isLow ? <span className="status pending">Rendah</span> : <span className="status paid">Aman</span>}
                    </td>
                  </tr>
                );
              })}
              {!loading && !products.length && (
                <tr><td colSpan={showAll ? 10 : 9} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Tidak ada data stok</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {view === 'gudang' && (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  {showAll && <th style={{ padding: '8px 10px' }}>Toko</th>}
                  <th style={{ padding: '8px 10px' }}>Gudang</th>
                  <th style={{ padding: '8px 10px' }}>Produk</th>
                  <th style={{ padding: '8px 10px' }}>SKU</th>
                  <th style={{ padding: '8px 10px' }}>Warna</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stok</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Reserved</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tersedia</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={showAll ? 8 : 7} style={{ padding: 10, color: 'var(--muted-foreground)' }}>Memuat…</td></tr>}
                {!loading && warehouseRows.map((r) => {
                  const qty = Number(r.quantity || 0);
                  const reserved = Number(r.reserved || 0);
                  return (
                    <tr key={`${r.warehouse_id}-${r.product_id}-${r.variant_id || 'x'}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      {showAll && <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{r.branch_name || '-'}</td>}
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.warehouse_name || '-'}</td>
                      <td style={{ padding: '8px 10px' }}>{r.product_name}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted-foreground)' }}>{r.sku || '-'}</td>
                      <td style={{ padding: '8px 10px' }}>{r.variant_color ? <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--muted)', fontSize: 10 }}>{r.variant_color}</span> : <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>-</span>}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(qty)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--muted-foreground)' }}>{money(reserved)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{money(Math.max(0, qty - reserved))}</td>
                    </tr>
                  );
                })}
                {!loading && !warehouseRows.length && (
                  <tr><td colSpan={showAll ? 8 : 7} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Belum ada stok tercatat di gudang.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        .report-print-header { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          html, body { width: auto !important; }
          .report-print-header { display: block; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; }
          .print-brand strong { display: block; font-size: 14px; letter-spacing: .14em; color: #1e3a5f; }
          .print-brand span { display: block; font-size: 18px; font-weight: 700; margin-top: 2px; color: #111827; }
          .print-meta { display: flex; flex-wrap: wrap; gap: 3px 16px; margin-top: 6px; font-size: 10px; color: #374151; }
          .no-print { display: none !important; }
          body * { visibility: visible !important; }
          .app-shell, .app-main { display: block !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .app-shell, .app-main, .app-content, .app-shell > div { display: block !important; width: 100% !important; }
          .app-content { padding: 0 !important; }
          .app-content > div { display: block !important; width: 100% !important; max-width: none !important; }
          .sidebar, .app-header { display: none !important; }
          .form-page { max-width: none !important; }
          .panel { border: none !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          table { width: 100% !important; min-width: 800px !important; table-layout: auto !important; border-collapse: collapse !important; font-size: 10px !important; }
          th { background: #1e3a5f !important; color: #fff !important; padding: 5px 7px !important; text-align: left !important; font-size: 10px !important; white-space: nowrap !important; }
          td { padding: 5px 7px !important; border-bottom: 1px solid #e5e7eb !important; vertical-align: top !important; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </section>
  );
}
