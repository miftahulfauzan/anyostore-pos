'use client';

import { useMemo } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRightLeft, ArrowUp, ArrowUpFromLine, Boxes, ChartNoAxesCombined, ClipboardCheck, Package, TriangleAlert } from 'lucide-react';
import { dateRangeDays } from './stock-movement.cjs';

const shortDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}` : '-'; };
const fullDate = (value) => { const [year, month, day] = String(value || '').split('-'); return year ? `${day}/${month}/${year}` : '-'; };

function WarehouseTrend({ daily }) {
  const max = Math.max(1, ...(daily || []).flatMap((item) => [Number(item.in || 0), Number(item.out || 0)]));
  const width = 760;
  const height = 210;
  const chartTop = 16;
  const chartBottom = 170;
  const point = (value, index) => `${daily.length > 1 ? (index / (daily.length - 1)) * width : width / 2},${chartBottom - (Number(value || 0) / max) * (chartBottom - chartTop)}`;
  const inPoints = (daily || []).map((item, index) => point(item.in, index)).join(' ');
  const outPoints = (daily || []).map((item, index) => point(item.out, index)).join(' ');
  const labelStep = Math.max(1, Math.ceil((daily.length - 1) / 6));
  return <div className="warehouse-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik stok masuk dan keluar">
      {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={chartTop + line * 51} y2={chartTop + line * 51} className="trend-grid-line" />)}
      <polyline points={inPoints} fill="none" className="trend-line trend-in" />
      <polyline points={outPoints} fill="none" className="trend-line trend-out" />
      {(daily || []).map((item, index) => <g key={item.date}><title>{`${shortDate(item.date)} · Masuk: ${Number(item.in || 0).toLocaleString('id-ID')} · Keluar: ${Number(item.out || 0).toLocaleString('id-ID')}`}</title><circle cx={point(item.in, index).split(',')[0]} cy={point(item.in, index).split(',')[1]} r="4" className="trend-dot trend-in" /><circle cx={point(item.out, index).split(',')[0]} cy={point(item.out, index).split(',')[1]} r="4" className="trend-dot trend-out" /></g>)}
    </svg>
    <div className="trend-labels" style={{ position: 'relative', minHeight: '1.5em' }}>{(daily || []).map((item, index) => index % labelStep === 0 || index === daily.length - 1 ? <span key={item.date} style={{ position: 'absolute', left: `${daily.length > 1 ? index / (daily.length - 1) * 100 : 50}%`, transform: index === 0 ? undefined : index === daily.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{shortDate(item.date)}</span> : null)}</div>
    <div className="trend-legend"><span><i className="legend-in" />Stok Masuk</span><span><i className="legend-out" />Stok Keluar</span></div>
  </div>;
}

export default function WarehouseDashboard({ data, start, end, dashboardKey = 'warehouse_dashboard' }) {
  const dashboard = data?.[dashboardKey] || {};
  const summary = dashboard.summary || {};
  const daily = useMemo(() => dateRangeDays(start, end, dashboard.daily), [start, end, dashboard.daily]);
  const totalStatus = Number(summary.safe_stock || 0) + Number(summary.low_stock || 0) + Number(summary.out_of_stock || 0);
  const hasStatusData = totalStatus > 0;
  const safePercent = hasStatusData ? Math.round(Number(summary.safe_stock || 0) / totalStatus * 100) : 0;
  const lowPercent = hasStatusData ? Math.round(Number(summary.low_stock || 0) / totalStatus * 100) : 0;
  const emptyPercent = hasStatusData ? Math.max(0, 100 - safePercent - lowPercent) : 0;
  const maxCategory = Math.max(1, ...(dashboard.categories || []).map((item) => Number(item.total || 0)));
  const maxOut = Math.max(1, ...(dashboard.top_products_out || []).map((item) => Number(item.total || 0)));
  const actionItems = [
    { href: '/inventory/incoming', label: 'Stock Masuk', icon: ArrowDownToLine, tone: 'green' },
    { href: '/inventory/outgoing', label: 'Stock Keluar', icon: ArrowUpFromLine, tone: 'red' },
    { href: '/inventory/opname', label: 'Opname', icon: ClipboardCheck, tone: 'cyan' },
    { href: '/inventory/transfers', label: 'Transfer', icon: ArrowRightLeft, tone: 'blue' },
    { href: '/products', label: 'Master Produk', icon: Package, tone: 'purple' },
    { href: '/inventory/mutation-report', label: 'Laporan', icon: ChartNoAxesCombined, tone: 'blue' },
  ];
  return <div className="warehouse-dashboard">
    <section className="warehouse-stat-grid" aria-label="Ringkasan stok gudang">
      <article className="warehouse-stat stat-blue"><span className="warehouse-stat-icon"><Package size={16} /></span><span>Total SKU</span><strong>{Number(summary.total_sku || 0).toLocaleString('id-ID')}</strong><small>Produk aktif</small></article>
      <article className="warehouse-stat stat-sky"><span className="warehouse-stat-icon"><Boxes aria-hidden="true" size={16} /></span><span>Total Stok</span><strong>{Number(summary.total_stock || 0).toLocaleString('id-ID')}</strong><small>Rata-rata {summary.total_sku ? Math.round(Number(summary.total_stock || 0) / Number(summary.total_sku)) : 0} / SKU</small></article>
      <article className="warehouse-stat stat-amber"><span className="warehouse-stat-icon"><TriangleAlert size={16} /></span><span>Hampir Habis</span><strong>{Number(summary.low_stock || 0).toLocaleString('id-ID')}</strong><small>SKU perlu dipantau</small></article>
      <article className="warehouse-stat stat-red"><span className="warehouse-stat-icon"><TriangleAlert size={16} /></span><span>Stok Kosong</span><strong>{Number(summary.out_of_stock || 0).toLocaleString('id-ID')}</strong><small>SKU tanpa stok</small></article>
    </section>

    <section className="panel warehouse-summary-panel">
      <div className="warehouse-panel-heading"><div><h2>Ringkasan</h2><p>{fullDate(start)} s/d {fullDate(end)}</p></div><span className="warehouse-range-note">Masuk {daily.reduce((sum, item) => sum + Number(item.in || 0), 0).toLocaleString('id-ID')} · Keluar {daily.reduce((sum, item) => sum + Number(item.out || 0), 0).toLocaleString('id-ID')}</span></div>
      <div className="warehouse-summary-triplet"><div><span className="summary-in"><ArrowDown aria-hidden="true" size={13} /> Masuk</span><strong>{daily.reduce((sum, item) => sum + Number(item.in || 0), 0).toLocaleString('id-ID')}</strong></div><div><span className="summary-out"><ArrowUp aria-hidden="true" size={13} /> Keluar</span><strong>{daily.reduce((sum, item) => sum + Number(item.out || 0), 0).toLocaleString('id-ID')}</strong></div><div><span className="summary-net"><ArrowRightLeft aria-hidden="true" size={13} /> Selisih</span><strong>{daily.reduce((sum, item) => sum + Number(item.in || 0) - Number(item.out || 0), 0).toLocaleString('id-ID')}</strong></div></div>
    </section>

    <section className="warehouse-chart-grid">
      <section className="panel"><div className="warehouse-panel-heading"><div><h2>Pergerakan Stok</h2><p>Jumlah unit masuk dan keluar pada gudang aktif, bukan saldo stok.</p></div></div><WarehouseTrend daily={daily} /></section>
      <section className="panel warehouse-status-panel"><div className="warehouse-panel-heading"><div><h2>Status Stok</h2><p>Kondisi SKU saat ini.</p></div></div>{hasStatusData ? <><div className="stock-donut" style={{ background: `conic-gradient(#2563eb 0 ${safePercent}%, #f59e0b ${safePercent}% ${safePercent + lowPercent}%, #ef4444 ${safePercent + lowPercent}% 100%)` }}><div><strong>{Number(summary.total_sku || 0).toLocaleString('id-ID')}</strong><span>SKU</span></div></div><div className="stock-status-legend"><span><i className="status-safe" />Aman <b>{safePercent}%</b></span><span><i className="status-low" />Hampir habis <b>{lowPercent}%</b></span><span><i className="status-empty" />Kosong <b>{emptyPercent}%</b></span></div></> : <div className="stock-donut-empty" role="status"><strong>Belum ada data stok</strong><span>Data status akan muncul setelah ada SKU.</span></div>}</section>
    </section>

    <section className="warehouse-chart-grid warehouse-chart-grid-bottom"><section className="panel"><div className="warehouse-panel-heading"><div><h2>Stok per Kategori</h2><p>Total stok produk aktif.</p></div></div><div className="warehouse-bars">{(dashboard.categories || []).map((item) => <div className="warehouse-bar-row" key={item.name}><span>{item.name}</span><div><i style={{ width: `${Number(item.total || 0) / maxCategory * 100}%` }} /></div><strong>{Number(item.total || 0).toLocaleString('id-ID')}</strong></div>)}</div>{!dashboard.categories?.length && <p className="muted">Belum ada data kategori.</p>}</section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Top Produk Keluar</h2><p>Periode yang dipilih.</p></div></div><div className="warehouse-bars out-bars">{(dashboard.top_products_out || []).map((item) => <div className="warehouse-bar-row" key={item.sku}><span title={item.sku || item.name}>{item.name || item.sku}</span><div><i style={{ width: `${Number(item.total || 0) / maxOut * 100}%` }} /></div><strong>{Number(item.total || 0).toLocaleString('id-ID')}</strong></div>)}</div>{!dashboard.top_products_out?.length && <p className="muted">Belum ada data keluar.</p>}</section></section>

    <section className="warehouse-lower-grid"><section className="panel"><div className="warehouse-panel-heading"><div><h2>Aksi Cepat</h2><p>Akses pekerjaan gudang yang sering dipakai.</p></div></div><div className="warehouse-action-grid">{actionItems.map((item) => { const Icon = item.icon; return <a key={item.href} href={item.href} className={`warehouse-action tone-${item.tone}`}><Icon size={16} /><span>{item.label}</span></a>; })}</div></section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Baru Masuk</h2><p>Produk dengan penerimaan terbaru.</p></div><a href="/inventory/mutation-report">Lihat semua</a></div><div className="warehouse-list">{(dashboard.recent_incoming || []).map((item) => <div key={item.sku}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-positive">+{Number(item.quantity || 0).toLocaleString('id-ID')}</b></div>)}</div>{!dashboard.recent_incoming?.length && <p className="muted">Belum ada penerimaan pada periode ini.</p>}</section><section className="panel"><div className="warehouse-panel-heading"><div><h2>Stok Menipis</h2><p>Prioritas pengadaan berikutnya.</p></div><a href="/inventory">Lihat stok</a></div><div className="warehouse-list">{(dashboard.low_stock || []).map((item) => <div key={item.sku}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-warning">{Number(item.total_stock || 0).toLocaleString('id-ID')}</b></div>)}{(dashboard.out_of_stock || []).slice(0, 3).map((item) => <div key={`empty-${item.sku}`}><span><strong>{item.name || item.sku}</strong><small>{item.sku || 'SKU belum diatur'}</small></span><b className="list-danger">0</b></div>)}</div>{!dashboard.low_stock?.length && !dashboard.out_of_stock?.length && <p className="muted">Semua stok aman.</p>}</section></section>
  </div>;
}
