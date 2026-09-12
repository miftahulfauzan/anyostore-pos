'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import DateRangePresets from '../../components/DateRangePresets';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const PRESETS = [
  { label: 'Hari ini', days: 0 },
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
];

// Tanggal lokal WIB — jangan pakai toISOString().slice(0,10) (UTC) untuk
// "hari ini", karena di pagi hari WIB hasilnya bisa salah sehari.
function localDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function presetDate(days) {
  const d = new Date();
  if (days > 0) d.setDate(d.getDate() - (days - 1));
  return localDate(d);
}
function displayDate(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}-${month}-${year}` : value || '—';
}

export default function MutationReportPage() {
  const [tab, setTab] = useState('in');
  const [preset, setPreset] = useState('');
  const [start, setStart] = useState(presetDate(7));
  const [end, setEnd] = useState(localDate());
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState('');
  const [desc, setDesc] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ product_count: 0, total_qty: 0 });
  const [breakdown, setBreakdown] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(6);
  const loadSeq = useRef(0);
  const headers = () => ({ 'Content-Type': 'application/json'});

  async function load(next = {}) {
    /* sesi via httpOnly cookie */
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const params = new URLSearchParams({
        type: next.type ?? tab,
        start: next.start ?? start,
        end: next.end ?? end,
        limit: '500',
      });
      if (next.store ?? store) params.set('branch_id', next.store ?? store);
      if (next.desc ?? desc) params.set('description', next.desc ?? desc);
      const r = await fetch(`${api}/inventory/mutation-report?${params}`, { headers: headers() });
      const b = await r.json();
      if (seq !== loadSeq.current) return;
      if (!r.ok) throw new Error(b.message || 'Laporan tidak dapat dimuat');
      setRows(b.data || []);
      setMobileVisibleCount(6);
      setSummary(b.summary || { product_count: 0, total_qty: 0 });
      setBreakdown(b.breakdown || []);
    } catch (e) { if (seq === loadSeq.current) setMessage(e.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => {
    /* sesi via httpOnly cookie */
    // ?all=1: untuk admin gudang, dropdown menampilkan semua cabang (bukan
    // hanya tipe gudang) karena laporan mencakup input siapa pun.
    fetch(`${api}/inventory/incoming/targets?all=1`, { headers: headers() })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setStores(b.data || []); })
      .catch((e) => setMessage(e.message));
    load();
  }, [tab]);

  function applyFilter() { load(); }
  function resetFilter() {
    setStart(presetDate(7)); setEnd(localDate()); setDesc(''); setStore('');
    load({ start: presetDate(7), end: localDate(), desc: '', store: '' });
  }
  function applyPreset(days) {
    const s = presetDate(days), e = localDate();
    setStart(s); setEnd(e);
    load({ start: s, end: e });
  }

  function exportCsv() {
    const header = ['Tanggal', 'Nomor', 'Gudang', 'Produk (nama+qty)', 'Qty', tab === 'out' ? 'Keluar ke' : 'Keterangan', 'Admin'];
    const lines = rows.map((r) => [
      displayDate(r.date),
      r.number,
      r.warehouse,
      r.products.map((p) => `${p.name || 'Produk tidak bernama'} x${p.qty}`).join(', '),
      r.total_qty,
      tab === 'out' ? (r.destination || '—') : r.description,
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
  const mobileRows = useMemo(() => displayRows.slice(0, mobileVisibleCount), [displayRows, mobileVisibleCount]);
  const mobileRemaining = Math.max(0, displayRows.length - mobileVisibleCount);

  return (
    <AppShell title={`Laporan Riwayat Barang ${tab === 'out' ? 'Keluar' : 'Masuk'}`} eyebrow="PRODUK & INVENTORI" actions={<>
      <button type="button" className="button-link" onClick={exportCsv} disabled={!rows.length}>Unduh Excel</button>
      <button type="button" className="button-link" onClick={() => window.print()} disabled={!rows.length}>Unduh PDF</button>
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
            <DateRangePresets active={preset} onPick={(key, range) => {
              setPreset(key);
              if (range) {
                setStart(range.start);
                setEnd(range.end);
                load({ start: range.start, end: range.end });
              }
            }} />
            <label style={{ minWidth: 180 }}>Toko / Gudang
              <select value={store} onChange={(e) => { const v = e.target.value; setStore(v); load({ store: v }); }}>
                <option value="">Semua</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type === 'gudang' ? ' (Gudang)' : ''}</option>)}
              </select>
            </label>
            <label style={{ minWidth: 150 }}>Dari<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label style={{ minWidth: 150 }}>Sampai<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label style={{ minWidth: 200, flex: 1 }}>Deskripsi / Filter<input placeholder="Cari deskripsi…" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <button type="button" onClick={applyFilter} disabled={loading} style={{ minHeight: 40 }}>{loading ? 'Memuat…' : 'Terapkan Filter'}</button>
            <button type="button" className="small secondary" onClick={resetFilter} style={{ minHeight: 40 }}>Reset</button>
          </div>
          {message && <p className="message" role="status">{message}</p>}
        </section>

        <section className="metrics-grid no-print" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 480 }}>
          <article className="metric-card"><div><span>Jumlah Produk</span><strong>{summary.product_count.toLocaleString('id-ID')}</strong></div></article>
          <article className="metric-card"><div><span>Total Qty</span><strong>{summary.total_qty.toLocaleString('id-ID')}</strong></div></article>
        </section>

        {!!breakdown.length && <section className="panel no-print">
          <h2 style={{ margin: 0, fontSize: 18 }}>{tab === 'out' ? 'Ringkasan Tujuan' : 'Ringkasan Keterangan'}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>{tab === 'out' ? 'Tujuan' : 'Keterangan'}</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Qty</th>
            </tr></thead>
            <tbody>{breakdown.map((item) => <tr key={item.label} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px' }}>{item.label}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{item.total_qty.toLocaleString('id-ID')}</td>
            </tr>)}</tbody>
          </table>
        </section>}

        <section className="panel mutation-report-desktop" style={{ overflowX: 'auto' }}>
          <table className="mutation-report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Tanggal</th>
                <th style={{ padding: '8px 10px' }}>Nomor</th>
                <th style={{ padding: '8px 10px' }}>Gudang</th>
                <th style={{ padding: '8px 10px' }}>Produk</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '8px 10px' }}>{tab === 'out' ? 'Keluar ke' : 'Keterangan'}</th>
                <th style={{ padding: '8px 10px' }}>Admin</th>
                <th style={{ padding: '8px 10px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Memuat…</td></tr>}
              {!loading && displayRows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>{displayDate(r.date)}</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.number}</td>
                  <td style={{ padding: '10px' }}><span className="warehouse-pill">{r.warehouse}</span></td>
                  <td style={{ padding: '10px', verticalAlign: 'top' }}>
                    <div className="movement-product-list">
                      {r.products.length ? r.products.map((p, i) => <span key={`${p.name || 'product'}-${i}`}>{p.name || 'Produk tidak bernama'}</span>) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <div className="movement-qty-list">{r.products.map((p, i) => <span key={`${p.name || 'product'}-qty-${i}`}>×{p.qty}</span>)}</div>
                    <strong className="movement-total-qty">{r.total_qty.toLocaleString('id-ID')}</strong>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{(tab === 'out' ? r.destination : r.description) || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</td>
                  <td style={{ padding: '8px 10px' }}>{r.admin}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {r.deletable ? <button type="button" className="link-button danger" onClick={() => removeBatch(r)}>Hapus</button> : <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Import</span>}
                  </td>
                </tr>
              ))}
              {!loading && !displayRows.length && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Belum ada data.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="panel mobile-mutation-list" aria-label={`Riwayat barang ${tab === 'out' ? 'keluar' : 'masuk'}`}>
          {loading && <p className="mobile-report-empty">Memuat…</p>}
          {!loading && !mobileRows.length && <p className="mobile-report-empty">Belum ada data.</p>}
          {!loading && mobileRows.map((r) => (
            <details key={r.id} className="mobile-mutation-batch">
              <summary>
                <span className="mobile-batch-summary-main">
                  <strong>{r.number}</strong>
                  <span>{displayDate(r.date)} · {r.warehouse}</span>
                  {tab === 'out' && <span className="mobile-batch-destination">Keluar ke: {r.destination || '—'}</span>}
                </span>
                <span className="mobile-batch-total"><strong>{r.total_qty.toLocaleString('id-ID')}</strong><small>pcs</small></span>
              </summary>
              <div className="mobile-batch-detail">
                <div className="mobile-batch-facts">
                  <div><span>Tanggal</span><strong>{displayDate(r.date)}</strong></div>
                  <div><span>Nomor batch</span><strong>{r.number}</strong></div>
                  <div><span>{tab === 'out' ? 'Keluar dari' : 'Masuk ke'}</span><strong>{r.warehouse}</strong></div>
                  <div><span>{tab === 'out' ? 'Keluar ke' : 'Keterangan'}</span><strong>{(tab === 'out' ? r.destination : r.description) || '—'}</strong></div>
                  <div><span>Admin</span><strong>{r.admin || '—'}</strong></div>
                  <div><span>Total</span><strong>{r.total_qty.toLocaleString('id-ID')} pcs</strong></div>
                </div>
                <div className="mobile-batch-products">
                  <span className="mobile-batch-section-title">Detail produk</span>
                  {r.products.length ? r.products.map((p, i) => (
                    <div className="mobile-batch-product" key={`${p.name || 'product'}-${i}`}>
                      <strong>{p.name || 'Produk tidak bernama'}</strong>
                      <span>{p.qty.toLocaleString('id-ID')} pcs</span>
                    </div>
                  )) : <span className="mobile-report-muted">Tidak ada detail produk.</span>}
                </div>
                {r.deletable ? <button type="button" className="link-button danger mobile-batch-delete" onClick={() => removeBatch(r)}>Hapus batch</button> : <span className="mobile-report-muted">Data import</span>}
              </div>
            </details>
          ))}
          {!loading && mobileRemaining > 0 && <button type="button" className="mobile-batch-more" onClick={() => setMobileVisibleCount((count) => count + 6)}>Lihat {Math.min(6, mobileRemaining)} batch berikutnya</button>}
        </section>
      </div>
      <style>{`
        .report-print-header { display: none; }
        .mobile-mutation-list { display: none; }
        .mutation-report-table { min-width: 980px; table-layout: fixed; }
        .mutation-report-table th { color: var(--muted-foreground); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; }
        .mutation-report-table th:nth-child(1) { width: 105px; }
        .mutation-report-table th:nth-child(2) { width: 225px; }
        .mutation-report-table th:nth-child(3) { width: 145px; }
        .mutation-report-table th:nth-child(4) { width: 275px; }
        .mutation-report-table th:nth-child(5) { width: 80px; }
        .mutation-report-table th:nth-child(6) { width: 160px; }
        .mutation-report-table th:nth-child(7) { width: 120px; }
        .mutation-report-table th:nth-child(8) { width: 80px; }
        .mutation-report-table td { vertical-align: top; }
        .warehouse-pill { display: inline-block; padding: 3px 7px; border-radius: 5px; background: var(--muted); color: var(--foreground); font-size: 11px; font-weight: 700; white-space: nowrap; }
        .movement-product-list, .movement-qty-list { display: grid; gap: 4px; line-height: 1.25; }
        .movement-product-list span { color: var(--foreground); font-weight: 600; }
        .movement-qty-list { justify-items: end; color: var(--foreground); font-weight: 600; }
        .movement-total-qty { display: block; margin-top: 7px; padding-top: 5px; border-top: 1px solid var(--border); }
        @media (max-width: 700px) {
          .mutation-report-desktop { display: none; }
          .mobile-mutation-list { display: grid; gap: 10px; }
          .mobile-mutation-batch { overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
          .mobile-mutation-batch > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; cursor: pointer; list-style: none; }
          .mobile-mutation-batch > summary::-webkit-details-marker { display: none; }
          .mobile-batch-summary-main { min-width: 0; display: grid; gap: 3px; }
          .mobile-batch-summary-main > strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
          .mobile-batch-summary-main > span { color: var(--muted-foreground); font-size: 11px; }
          .mobile-batch-summary-main .mobile-batch-destination { color: var(--foreground); font-weight: 600; }
          .mobile-batch-total { flex: 0 0 auto; display: grid; justify-items: end; line-height: 1.1; color: var(--primary); }
          .mobile-batch-total strong { font-size: 18px; }
          .mobile-batch-total small { color: var(--muted-foreground); font-size: 10px; }
          .mobile-batch-detail { display: grid; gap: 12px; padding: 0 14px 14px; border-top: 1px solid var(--border); }
          .mobile-batch-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-top: 12px; }
          .mobile-batch-facts > div { min-width: 0; display: grid; gap: 3px; padding: 8px; border-radius: 8px; background: var(--muted); }
          .mobile-batch-facts span, .mobile-batch-section-title { color: var(--muted-foreground); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
          .mobile-batch-facts strong { overflow-wrap: anywhere; font-size: 12px; }
          .mobile-batch-products { display: grid; gap: 6px; }
          .mobile-batch-product { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); }
          .mobile-batch-product strong { min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
          .mobile-batch-product span { flex: 0 0 auto; color: var(--muted-foreground); font-size: 12px; font-weight: 700; }
          .mobile-batch-delete { justify-self: start; }
          .mobile-report-empty, .mobile-report-muted { color: var(--muted-foreground); text-align: center; }
          .mobile-batch-more { width: 100%; min-height: 42px; }
        }
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
          .panel { border: none !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; }
          table { width: 100% !important; min-width: 900px !important; table-layout: auto !important; border-collapse: collapse !important; font-size: 10px !important; }
          th { background: #1e3a5f !important; color: #fff !important; padding: 5px 7px !important; text-align: left !important; font-size: 10px !important; white-space: nowrap !important; }
          td { padding: 5px 7px !important; border-bottom: 1px solid #e5e7eb !important; vertical-align: top !important; }
          td:nth-child(2) { white-space: nowrap !important; font-family: monospace !important; }
          td:nth-child(5) { white-space: nowrap !important; text-align: right !important; font-weight: 700 !important; }
          tr { break-inside: avoid; }
          .link-button { display: none !important; }
          .message { display: none !important; }
          .mobile-mutation-list { display: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
