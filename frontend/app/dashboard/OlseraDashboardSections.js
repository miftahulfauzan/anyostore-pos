'use client';

import { ArrowDownLeft, ArrowUpRight, BarChart3, BriefcaseBusiness, ChartNoAxesCombined, CircleDollarSign, RotateCcw, Store } from 'lucide-react';

const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const number = (value) => Number(value || 0);
const dateLabel = (value) => {
  const raw = String(value || '');
  return raw.length >= 10 ? raw.slice(8, 10) : raw;
};

const colors = {
  denim: '#1E3A5F',
  blue: '#2563EB',
  teal: '#16856A',
  terracotta: '#C2410C',
  purple: '#7C3AED',
};

function Section({ title, description, icon: Icon, tone = 'denim', children, className = '' }) {
  return <section className={`panel dashboard-report-section report-tone-${tone} ${className}`}>
    <div className="section-heading dashboard-report-heading">
      <div><h2>{Icon && <Icon aria-hidden="true" size={19} />}{title}</h2>{description && <p>{description}</p>}</div>
    </div>
    {children}
  </section>;
}

function MetricRow({ label, value }) {
  return <div className="dashboard-report-row"><span>{label}</span><strong>{value}</strong></div>;
}

function TrendChart({ rows, valueKey = 'revenue', color, emptyMessage }) {
  const visible = (rows || []).slice(-14);
  const valueRows = visible.slice(-7);
  const values = visible.map((row) => number(row[valueKey]));
  if (!visible.length) return <p className="dashboard-report-empty">{emptyMessage}</p>;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
    const y = 94 - (value / max) * 82;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,94 ${points} 100,94`;
  return <div className="dashboard-report-chart" aria-label="Grafik tren laporan">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Grafik tren">
      <line x1="0" y1="94" x2="100" y2="94" className="chart-axis" />
      <line x1="0" y1="53" x2="100" y2="53" className="chart-grid" />
      <line x1="0" y1="12" x2="100" y2="12" className="chart-grid" />
      <polygon points={area} fill={`${color}22`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {values.map((value, index) => {
        const x = visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
        const y = 94 - (value / max) * 82;
        return <circle key={`${visible[index].date}-${index}`} cx={x} cy={y} r="1.7" fill="#fff" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
    <div className="dashboard-report-axis-labels">
      {visible.map((row) => <span key={row.date}>{dateLabel(row.date)}</span>)}
    </div>
    <div className="dashboard-report-values" aria-label="Nilai per tanggal">
      <span className="dashboard-report-values-label">Nilai per tanggal</span>
      <div className="dashboard-report-values-list">
        {valueRows.map((row, index) => <div className="dashboard-report-value-row" key={`${row.date}-${index}`}>
          <span>{dateLabel(row.date)}</span>
          <strong>{rupiah(row[valueKey])}</strong>
        </div>)}
      </div>
    </div>
  </div>;
}

function SeriesSection({ title, icon, tone, color, rows, valueKey, emptyMessage }) {
  return <Section title={title} icon={icon} tone={tone} className="dashboard-report-series">
    <TrendChart rows={rows} valueKey={valueKey} color={color} emptyMessage={emptyMessage} />
    <span className="dashboard-report-legend"><i style={{ backgroundColor: color }} />{title}</span>
  </Section>;
}

function ProductGroups({ groups }) {
  const visible = (groups || []).slice(0, 6);
  const max = Math.max(1, ...visible.map((group) => number(group.quantity_sold)));
  return <Section title="Top product groups" icon={BarChart3} tone="purple" className="dashboard-report-products">
    {visible.length ? visible.map((group) => <div className="dashboard-product-group" key={group.name}>
      <div><span>{group.name || 'Tanpa kategori'}</span><strong>{number(group.quantity_sold)} pcs</strong></div>
      <span className="dashboard-product-track"><i style={{ width: `${Math.max(3, number(group.quantity_sold) / max * 100)}%` }} /></span>
      <small>{rupiah(group.revenue)}</small>
    </div>) : <p className="dashboard-report-empty">Belum ada grup produk pada periode ini.</p>}
  </Section>;
}

function SalesSources({ sources }) {
  if (!sources?.length) return null;
  return <Section title="Sumber penjualan" icon={Store} tone="blue" className="dashboard-report-sources">
    {sources.slice(0, 5).map((source) => <div className="dashboard-source" key={source.name}>
      <div><span>{source.name}</span><strong>{number(source.share)}%</strong></div>
      <span className="dashboard-product-track"><i style={{ width: `${Math.max(3, Math.min(100, number(source.share)))}%` }} /></span>
      <small>{number(source.transactions)} transaksi · {rupiah(source.revenue)}</small>
    </div>)}
  </Section>;
}

export default function OlseraDashboardSections({ reportData, fallbackData }) {
  if (!reportData) return <section className="panel dashboard-report-loading"><p>Memuat laporan toko…</p></section>;
  const summary = reportData.summary || fallbackData?.summary || {};
  const groups = reportData.product_groups || [];
  return <div className="dashboard-report-layout">
    <Section title="Sekilas toko" description={reportData.branch_name || 'Ringkasan periode terpilih'} icon={BriefcaseBusiness} tone="denim" className="dashboard-report-glance">
      <MetricRow label="Pelanggan baru" value={number(summary.new_customers)} />
      <MetricRow label="Pesanan" value={number(summary.transactions)} />
      <MetricRow label="Pendapatan" value={rupiah(summary.gross_sales ?? summary.revenue)} />
      <MetricRow label="Pemasukan" value={rupiah(summary.income)} />
      <MetricRow label="Pengeluaran" value={rupiah(summary.expenses)} />
      <MetricRow label="Pengembalian" value={rupiah(summary.return_amount)} />
      <MetricRow label="Rata-rata transaksi" value={rupiah(summary.average_transaction)} />
    </Section>

    <Section title="Sales" description="Penjualan transaksi selesai pada periode terpilih." icon={ChartNoAxesCombined} tone="blue" className="dashboard-report-sales">
      <div className="dashboard-report-focal"><span>Total sales</span><strong>{rupiah(summary.gross_sales ?? summary.revenue)}</strong><small>{number(summary.transactions)} transaksi</small></div>
      <TrendChart rows={reportData.daily_sales} color={colors.blue} emptyMessage="Belum ada data penjualan pada periode ini." />
      <span className="dashboard-report-legend"><i style={{ backgroundColor: colors.blue }} />Sales</span>
    </Section>

    <div className="dashboard-report-series-grid">
      <SeriesSection title="Income" icon={ArrowDownLeft} tone="teal" color={colors.teal} rows={reportData.daily_income} valueKey="amount" emptyMessage="Belum ada data pendapatan pada periode ini." />
      <SeriesSection title="Expense" icon={ArrowUpRight} tone="terracotta" color={colors.terracotta} rows={reportData.daily_expenses} valueKey="amount" emptyMessage="Belum ada data pengeluaran pada periode ini." />
      <SeriesSection title="Return" icon={RotateCcw} tone="purple" color={colors.purple} rows={reportData.daily_returns} valueKey="amount" emptyMessage="Belum ada data retur pada periode ini." />
      <Section title="Hasil usaha" icon={CircleDollarSign} tone="denim" className="dashboard-report-profit">
        <MetricRow label="Laba kotor" value={rupiah(summary.gross_profit)} />
        <MetricRow label="Laba bersih" value={rupiah(summary.net_profit)} />
        <MetricRow label="Retur disetujui" value={`${number(summary.return_count)} catatan`} />
      </Section>
    </div>

    <div className="dashboard-report-detail-grid">
      <ProductGroups groups={groups} />
      <SalesSources sources={reportData.sales_sources} />
    </div>
  </div>;
}
