'use client';

import {
  AlertTriangle,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleDollarSign,
  CreditCard,
  PackageSearch,
  ShoppingBag,
} from 'lucide-react';
import { useState } from 'react';

const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const number = (value) => Number(value || 0);
const percent = (value) => `${number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dateLabel = (value) => {
  const raw = String(value || '');
  return raw.length >= 10 ? raw.slice(8, 10) : raw;
};

const colors = {
  denim: '#1E3A5F',
  blue: '#2563EB',
  teal: '#16856A',
  terracotta: '#C2410C',
};

function Section({ title, description, icon: Icon, tone = 'denim', children, className = '', ...props }) {
  return <section className={`panel dashboard-report-section report-tone-${tone} ${className}`} {...props}>
    <div className="section-heading dashboard-report-heading">
      <div>
        <h2>{Icon && <Icon aria-hidden="true" size={19} />}{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
    {children}
  </section>;
}

function MetricRow({ label, value }) {
  return <div className="dashboard-report-row"><span>{label}</span><strong>{value}</strong></div>;
}

function MetricTile({ label, value, icon: Icon, tone = 'denim' }) {
  return <div className={`dashboard-kpi-tile dashboard-kpi-${tone}`}>
    <span className="dashboard-kpi-icon"><Icon aria-hidden="true" size={16} /></span>
    <span className="dashboard-kpi-label">{label}</span>
    <strong>{value}</strong>
  </div>;
}

function TrendChart({ rows, valueKey = 'revenue', color, emptyMessage, totalLabel = 'Total' }) {
  const visible = (rows || []).slice(-14);
  const [showValues, setShowValues] = useState(false);
  const values = visible.map((row) => number(row[valueKey] ?? row.sales));
  if (!visible.length) return <p className="dashboard-report-empty">{emptyMessage}</p>;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
    const y = 94 - (value / max) * 82;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,94 ${points} 100,94`;
  return <div className="dashboard-report-chart" aria-label="Grafik tren laporan">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Grafik tren penjualan">
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
    <button
      type="button"
      className="dashboard-report-values-toggle"
      aria-expanded={showValues}
      onClick={() => setShowValues((current) => !current)}
    >
      {showValues ? 'Sembunyikan angka' : 'Lihat angka'}
    </button>
    {showValues && <div className="dashboard-report-chart-total" aria-live="polite">
      <span>{totalLabel}</span>
      <strong>{rupiah(values.reduce((total, value) => total + value, 0))}</strong>
    </div>}
  </div>;
}

function ListCard({ title, icon, tone, items, emptyMessage, renderItem }) {
  return <Section title={title} icon={icon} tone={tone} className="dashboard-list-card">
    {items.length ? items.map((item, index) => <div className="dashboard-list-item" key={`${item.id || item.name || title}-${index}`}>
      {renderItem(item)}
    </div>) : <p className="dashboard-report-empty dashboard-list-empty">{emptyMessage}</p>}
  </Section>;
}

function normalizeRows(rows, fallbackRows) {
  return (rows || fallbackRows || []).map((row) => ({
    ...row,
    revenue: row.revenue ?? row.sales ?? 0,
  }));
}

export default function OlseraDashboardSections({ reportData, fallbackData }) {
  const source = reportData || fallbackData;
  if (!source) return <section className="panel dashboard-report-loading"><p>Memuat laporan toko…</p></section>;

  const sourceSummary = reportData?.summary || fallbackData?.selected_summary || fallbackData?.summary || {};
  const summary = {
    ...sourceSummary,
    gross_sales: sourceSummary.gross_sales ?? sourceSummary.revenue ?? sourceSummary.sales ?? 0,
    transactions: sourceSummary.transactions ?? 0,
    expenses: sourceSummary.expenses ?? 0,
    return_amount: sourceSummary.return_amount ?? sourceSummary.refund_amount ?? 0,
  };
  const dailySales = normalizeRows(reportData?.daily_sales, fallbackData?.selected_sales_trend || fallbackData?.sales_trend);
  const methods = reportData?.payment_methods || fallbackData?.selected_payment_breakdown || fallbackData?.payment_breakdown || [];
  const products = reportData?.products || fallbackData?.products || [];
  const lowStock = reportData?.low_stock || fallbackData?.low_stock || [];
  const productsSold = summary.products_sold != null
    ? number(summary.products_sold)
    : products.reduce((total, product) => total + number(product.quantity_sold), 0);
  const paymentTotal = methods.reduce((total, method) => total + number(method.amount ?? method.total), 0);
  const hasProfit = reportData?.summary?.net_profit != null;
  const fourthKpiLabel = hasProfit ? 'Laba bersih' : 'Pengeluaran';
  const fourthKpiValue = hasProfit ? rupiah(summary.net_profit) : rupiah(summary.expenses);

  return <div className="dashboard-report-layout dashboard-merged">
    <Section
      title="Ringkasan toko"
      description={reportData?.branch_name || 'Periode yang dipilih'}
      icon={BriefcaseBusiness}
      tone="denim"
      className="dashboard-overview-card"
      data-dashboard-section="summary"
    >
      <div className="dashboard-kpi-grid">
        <MetricTile label="Pendapatan" value={rupiah(summary.gross_sales)} icon={CircleDollarSign} tone="denim" />
        <MetricTile label="Pesanan" value={number(summary.transactions)} icon={ShoppingBag} tone="blue" />
        <MetricTile label="Produk terjual" value={`${productsSold} pcs`} icon={PackageSearch} tone="teal" />
        <MetricTile label={fourthKpiLabel} value={fourthKpiValue} icon={CircleDollarSign} tone="purple" />
      </div>
      <div className="dashboard-summary-meta">
        <MetricRow label="Margin keuntungan" value={summary.profit_margin_percent != null ? percent(summary.profit_margin_percent) : '-'} />
        <MetricRow label="Pengeluaran" value={rupiah(summary.expenses)} />
        <MetricRow label="Pengembalian" value={rupiah(summary.return_amount)} />
      </div>
    </Section>

    <Section
      title="Penjualan"
      description="Ringkasan penjualan pada periode yang dipilih."
      icon={ChartNoAxesCombined}
      tone="blue"
      className="dashboard-sales-summary"
      data-dashboard-section="sales"
    >
      <div className="dashboard-report-focal"><span>Total penjualan</span><strong>{rupiah(summary.gross_sales)}</strong><small>{number(summary.transactions)} pesanan</small></div>
      <TrendChart rows={dailySales} color={colors.blue} totalLabel="Total penjualan" emptyMessage="Belum ada data penjualan pada periode ini." />
      <span className="dashboard-report-legend"><i style={{ backgroundColor: colors.blue }} />Penjualan</span>
      <div className="dashboard-sales-metrics">
        <MetricRow label="Pembayaran" value={paymentTotal ? rupiah(paymentTotal) : rupiah(summary.gross_sales)} />
        <MetricRow label="Pengeluaran" value={rupiah(summary.expenses)} />
        <MetricRow label="Pengembalian" value={rupiah(summary.return_amount)} />
      </div>
    </Section>

    <div className="dashboard-secondary-grid">
      <ListCard
        title="Produk terlaris"
        icon={ShoppingBag}
        tone="teal"
        items={products.slice(0, 5)}
        emptyMessage="Belum ada produk terlaris pada periode ini."
        renderItem={(product) => <>
          <div><strong>{product.name || '-'}</strong><span>{number(product.quantity_sold)} pcs</span></div>
          <div className="dashboard-list-track"><i style={{ width: `${Math.min(100, Math.max(5, number(product.quantity_sold) / Math.max(1, number(products[0]?.quantity_sold)) * 100))}%` }} /></div>
        </>}
      />
      <ListCard
        title="Stok rendah"
        icon={AlertTriangle}
        tone="terracotta"
        items={lowStock.slice(0, 5)}
        emptyMessage="Tidak ada stok yang perlu diperiksa."
        renderItem={(product) => <>
          <div><strong>{product.name || '-'}</strong><span>{number(product.stock)} / min {number(product.min_stock)}</span></div>
          <div className="dashboard-list-track"><i style={{ width: `${Math.min(100, Math.max(8, number(product.min_stock) > 0 ? number(product.stock) / number(product.min_stock) * 100 : 8))}%` }} /></div>
        </>}
      />
    </div>

    <div className="dashboard-summary-footnote">
      <CreditCard aria-hidden="true" size={16} />
      <span>Data mengikuti periode dan toko/gudang yang sedang dipilih.</span>
    </div>
  </div>;
}
