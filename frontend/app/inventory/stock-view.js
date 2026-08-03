'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const money = (v) => Number(v || 0).toLocaleString('id-ID');

// Laporan stok Per Gudang (satu-satunya tampilan di Stok Produk).
export default function StockReportSection() {
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [isGudang, setIsGudang] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openKey, setOpenKey] = useState(null);
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
      setBranches((brs || []).filter((b) => b.is_active !== false));
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
    fetch(`${api}/inventory/stock-by-warehouse?${qs}`, { headers: headers() })
      .then((r) => r.json())
      .then((b) => {
        if (seq !== loadSeq.current) return;
        if (!b.success) throw new Error(b.message);
        setWarehouseRows(b.data || []);
      })
      .catch((e) => { if (seq === loadSeq.current) setMessage(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }, [cat, q, branchId, isOwner, isGudang]);

  const showAll = (isOwner || isGudang) && !branchId;

  // Ringkas per produk+warna: total stok lintas gudang, rincian per gudang
  // tetap tersedia lewat tombol "n gudang".
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of warehouseRows) {
      const key = `${r.product_id}:${r.variant_id || 'x'}`;
      let g = map.get(key);
      if (!g) {
        g = { key, product_id: r.product_id, name: r.product_name, sku: r.sku, color: r.variant_color || null, min_stock: Number(r.min_stock || 0), warehouses: [], total: 0, reserved: 0 };
        map.set(key, g);
      }
      g.warehouses.push({ warehouse_name: r.warehouse_name, branch_name: r.branch_name, quantity: Number(r.quantity || 0), reserved: Number(r.reserved || 0) });
      g.total += Number(r.quantity || 0);
      g.reserved += Number(r.reserved || 0);
    }
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [warehouseRows]);

  const summary = useMemo(() => {
    const rows = grouped;
    return {
      total_products: new Set(rows.map((r) => r.product_id)).size,
      total_stock: rows.reduce((s, r) => s + r.total, 0),
      total_branches: new Set(warehouseRows.map((r) => r.branch_name).filter(Boolean)).size,
      low_stock: rows.filter((r) => r.total > 0 && r.total <= r.min_stock).length,
      out_of_stock: rows.filter((r) => r.total === 0).length,
    };
  }, [grouped]);

  function exportCsv() {
    if (!grouped.length) return;
    const header = showAll
      ? ['Toko', 'Produk', 'SKU', 'Warna', 'Lokasi', 'Stok', 'Reserved', 'Tersedia']
      : ['Produk', 'SKU', 'Warna', 'Lokasi', 'Stok', 'Reserved', 'Tersedia'];
    const lines = grouped.map((g) => [
      ...(showAll ? [[...new Set(g.warehouses.map((w) => w.branch_name)).filter(Boolean)].join(', ')] : []),
      g.name, g.sku || '', g.color || '',
      g.warehouses.map((w) => `${w.warehouse_name}: ${w.quantity}`).join(' | '),
      g.total, g.reserved, Math.max(0, g.total - g.reserved),
    ]);
    const csv = [header, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-stok-gudang-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="form-page" style={{ maxWidth: 1100 }}>
      <div className="panel">
        <div className="report-print-header">
          <div className="print-brand">
            <strong>ANYOSTORE</strong>
            <span>Laporan Stok Per Gudang</span>
          </div>
          <div className="print-meta">
            <span>Dicetak: {new Date().toLocaleString('id-ID')}</span>
            <span>Total Produk: {summary.total_products}</span>
            <span>Total Stok: {money(summary.total_stock)}</span>
            <span>Mode: {showAll ? 'Semua Toko' : 'Satu Toko'}</span>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ flex: 1 }} />
          <button type="button" className="button-link" onClick={exportCsv} disabled={!warehouseRows.length}>Unduh Excel</button>
          <button type="button" className="button-link" onClick={() => window.print()} disabled={!warehouseRows.length}>Unduh PDF</button>
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
                <th style={{ padding: '8px 10px' }}>Warna</th>
                <th style={{ padding: '8px 10px' }}>Lokasi</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stok</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Reserved</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tersedia</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={showAll ? 8 : 7} style={{ padding: 10, color: 'var(--muted-foreground)' }}>Memuat…</td></tr>}
              {!loading && grouped.map((g) => (
                <Fragment key={g.key}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {showAll && <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>{[...new Set(g.warehouses.map((w) => w.branch_name).filter(Boolean))].join(', ') || '-'}</td>}
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{g.name}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted-foreground)' }}>{g.sku || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{g.color ? <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--muted)', fontSize: 10 }}>{g.color}</span> : <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>-</span>}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button type="button" className="link-button" onClick={() => setOpenKey(openKey === g.key ? null : g.key)}>{g.warehouses.length} gudang {openKey === g.key ? '▲' : '▼'}</button>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(g.total)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--muted-foreground)' }}>{money(g.reserved)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{money(Math.max(0, g.total - g.reserved))}</td>
                  </tr>
                  {openKey === g.key && (
                    <tr style={{ borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                      <td colSpan={showAll ? 8 : 7} style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {g.warehouses.map((w, i) => (
                            <span key={i} style={{ padding: '3px 8px', borderRadius: 999, background: '#eef2ff', color: '#1e3a5f', fontSize: 11, fontWeight: 600 }}>
                              {w.branch_name ? `${w.branch_name} — ` : ''}{w.warehouse_name}: {w.quantity}{w.reserved ? ` (reserved ${w.reserved})` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && !grouped.length && (
                <tr><td colSpan={showAll ? 8 : 7} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Belum ada stok tercatat di gudang.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
