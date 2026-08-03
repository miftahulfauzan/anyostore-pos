'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const PRESETS = [
  { label: 'Hari ini', days: 0 },
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
];

function presetDate(days) {
  const d = new Date();
  if (days > 0) d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export default function MutationReportPage() {
  const [tab, setTab] = useState('in');
  const [start, setStart] = useState(presetDate(7));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ product_count: 0, total_qty: 0 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const loadSeq = useRef(0);
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

  async function load(next = {}) {
    if (!token()) { window.location.assign('/'); return; }
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const params = new URLSearchParams({
        type: next.type ?? tab,
        start: next.start ?? start,
        end: next.end ?? end,
        limit: '500',
      });
      if (next.desc ?? desc) params.set('description', next.desc ?? desc);
      const r = await fetch(`${api}/inventory/mutation-report?${params}`, { headers: headers() });
      const b = await r.json();
      if (seq !== loadSeq.current) return;
      if (!r.ok) throw new Error(b.message || 'Laporan tidak dapat dimuat');
      setRows(b.data || []);
      setSummary(b.summary || { product_count: 0, total_qty: 0 });
    } catch (e) { if (seq === loadSeq.current) setMessage(e.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  function applyFilter() { load(); }
  function resetFilter() {
    setStart(presetDate(7)); setEnd(new Date().toISOString().slice(0, 10)); setDesc('');
    load({ start: presetDate(7), end: new Date().toISOString().slice(0, 10), desc: '' });
  }
  function applyPreset(days) {
    const s = presetDate(days), e = new Date().toISOString().slice(0, 10);
    setStart(s); setEnd(e);
    load({ start: s, end: e });
  }

  function exportCsv() {
    const header = ['Tanggal', 'Nomor', 'Gudang', 'Produk (kode+qty)', 'Total Qty', 'Deskripsi', 'Admin'];
    const lines = rows.map((r) => [
      r.date,
      r.number,
      r.warehouse,
      r.products.map((p) => `${p.code} x${p.qty}`).join(', '),
      r.total_qty,
      r.description,
      r.admin,
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `riwayat-${tab === 'out' ? 'keluar' : 'masuk'}-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function removeBatch(row) {
    if (!confirm(`Hapus ${row.number} (${row.total_qty} item)? Stok akan dikembalikan.`)) return;
    try {
      const r = await fetch(`${api}/inventory/mutation-report/${tab}/${row.id}`, { method: 'DELETE', headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(b.message);
      load();
    } catch (e) { setMessage(e.message); }
  }

  const displayRows = useMemo(() => rows, [rows]);

  return (
    <AppShell title="Laporan Riwayat Barang Masuk" eyebrow="PRODUK & INVENTORI" actions={<>
      <button type="button" className="button-link" onClick={exportCsv} disabled={!rows.length}>Export Excel</button>
      <button type="button" className="button-link" onClick={() => window.print()} disabled={!rows.length}>Export PDF</button>
    </>}>
      <div style={{ display: 'grid', gap: '1rem', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header khusus cetak */}
        <div className="report-print-header">
          <div className="print-brand">
            <strong>ANYOSTORE</strong>
            <span>Laporan Riwayat Barang {tab === 'out' ? 'Keluar' : 'Masuk'}</span>
          </div>
          <div className="print-meta">
            <span>Periode: {start} s/d {end}</span>
            <span>Dicetak: {new Date().toLocaleString('id-ID')}</span>
            <span>Total Produk: {summary.product_count.toLocaleString('id-ID')}</span>
            <span>Total Qty: {summary.total_qty.toLocaleString('id-ID')}</span>
          </div>
        </div>
        <div className="tabs no-print">
          <button type="button" className={tab === 'in' ? 'active' : ''} onClick={() => setTab('in')}>Riwayat Masuk</button>
          <button type="button" className={tab === 'out' ? 'active' : ''} onClick={() => setTab('out')}>Riwayat Keluar</button>
        </div>

        <section className="panel no-print">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            {PRESETS.map((p) => <button key={p.days} type="button" className="small secondary" onClick={() => applyPreset(p.days)}>{p.label}</button>)}
            <label style={{ minWidth: 150 }}>Dari<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label style={{ minWidth: 150 }}>Sampai<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label style={{ minWidth: 200, flex: 1 }}>Deskripsi / Filter<input placeholder="Cari deskripsi…" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <button type="button" onClick={applyFilter} disabled={loading} style={{ minHeight: 40 }}>{loading ? 'Memuat…' : 'Apply Filter'}</button>
            <button type="button" className="small secondary" onClick={resetFilter} style={{ minHeight: 40 }}>Reset Filter</button>
          </div>
          {message && <p className="message" role="status">{message}</p>}
        </section>

        <section className="metrics-grid no-print" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 480 }}>
          <article className="metric-card"><div><span>Product Count</span><strong>{summary.product_count.toLocaleString('id-ID')}</strong></div></article>
          <article className="metric-card"><div><span>Total Quantity</span><strong>{summary.total_qty.toLocaleString('id-ID')}</strong></div></article>
        </section>

        <section className="panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Tanggal</th>
                <th style={{ padding: '8px 10px' }}>Nomor</th>
                <th style={{ padding: '8px 10px' }}>Gudang</th>
                <th style={{ padding: '8px 10px' }}>Produk</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Qty</th>
                <th style={{ padding: '8px 10px' }}>Deskripsi</th>
                <th style={{ padding: '8px 10px' }}>Admin</th>
                <th style={{ padding: '8px 10px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Memuat…</td></tr>}
              {!loading && displayRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>{r.date}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.number}</td>
                  <td style={{ padding: '8px 10px' }}>{r.warehouse}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: 'var(--muted)', fontSize: 11 }}>{r.product_count} produk</span>{' '}
                    <button type="button" className="link-button" onClick={() => setDetail(detail?.id === r.id ? null : r)}>{detail?.id === r.id ? 'Tutup' : 'Lihat'}</button>
                    {detail?.id === r.id && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {r.products.map((p, i) => <span key={i} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11 }}>{p.code} × {p.qty}</span>)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{r.total_qty.toLocaleString('id-ID')}</td>
                  <td style={{ padding: '8px 10px' }}>{r.description || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                  <td style={{ padding: '8px 10px' }}>{r.admin}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <button type="button" className="link-button" onClick={() => setDetail(detail?.id === r.id ? null : r)}>View Detail</button>
                    <button type="button" className="link-button danger" onClick={() => removeBatch(r)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!loading && !displayRows.length && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Belum ada data.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
      <style>{`
        .report-print-header { display: none; }
        @media print {
          .report-print-header { display: block; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #1e3a5f; }
          .print-brand strong { display: block; font-size: 16px; letter-spacing: .12em; color: #1e3a5f; }
          .print-brand span { display: block; font-size: 20px; font-weight: 700; margin-top: 2px; color: #111827; }
          .print-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 8px; font-size: 11px; color: #374151; }
          .no-print { display: none !important; }
          body * { visibility: visible !important; }
          .app-shell, .app-main { display: block !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .sidebar { display: none !important; }
          .app-header { display: none !important; }
          .panel { border: none !important; box-shadow: none !important; padding: 0 !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 11px !important; }
          th { background: #1e3a5f !important; color: #fff !important; padding: 6px 8px !important; text-align: left !important; font-size: 11px !important; }
          td { padding: 6px 8px !important; border-bottom: 1px solid #e5e7eb !important; }
          tr { break-inside: avoid; }
          .link-button { display: none !important; }
          .message { display: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
