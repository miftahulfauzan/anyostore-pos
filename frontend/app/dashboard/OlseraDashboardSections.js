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
import Link from 'next/link';
import { useId, useState } from 'react';

const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const number = (value) => Number(value || 0);
const percent = (value) => `${number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const changePercent = (current, previous) => {
  if (previous == null) return null;
  const before = number(previous);
  const now = number(current);
  if (before === 0) return now === 0 ? '0%' : null;
  const change = ((now - before) / Math.abs(before)) * 100;
  return `${change >= 0 ? '↑ +' : '↓ '}${Math.abs(change).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};
const dateLabel = (value) => {
  const raw = String(value || '');
  return raw.length >= 10 ? raw.slice(8, 10) : raw;
};
const buildSmoothPath = (points) => {
  if (!points.length) return '';
  const [firstX, firstY] = points[0];
  let path = `M ${firstX},${firstY}`;
  for (let index = 1; index < points.length; index += 1) {
    const [previousX, previousY] = points[index - 1];
    const [currentX, currentY] = points[index];
    const midpointX = (previousX + currentX) / 2;
    path += ` C ${midpointX},${previousY} ${midpointX},${currentY} ${currentX},${currentY}`;
  }
  return path;
};

const colors = {
  denim: '#1E3A5F',
  blue: '#2563EB',
  teal: '#16856A',
  terracotta: '#C2410C',
};

function Section({ title, description, icon: Icon, tone = 'denim', meta, children, className = '', ...props }) {
  return <section className={`panel dashboard-report-section report-tone-${tone} ${className}`} {...props}>
    <div className="section-heading dashboard-report-heading section-head">
      <div className="section-head-main">
        <span className="section-accent" aria-hidden="true" />
        {Icon && <Icon aria-hidden="true" size={17} />}
        <h2>{title}</h2>
      </div>
      {meta ? (
        <span className="section-head-meta">
          <strong>{meta.value}</strong>
          {meta.sub ? <small> · {meta.sub}</small> : null}
        </span>
      ) : null}
    </div>
    {children}
  </section>;
}

function MetricRow({ label, value, icon: Icon, tone = 'denim' }) {
  return <div className="dashboard-report-row">
    <span className="dashboard-report-row-label">
      {Icon && <i className={`dashboard-report-row-icon report-row-${tone}`}><Icon aria-hidden="true" size={15} /></i>}
      {label}
    </span>
    <strong>{value}</strong>
  </div>;
}

function MetricTile({ label, value, icon: Icon, tone = 'denim', change }) {
  return <div className={`dashboard-kpi-tile dashboard-kpi-${tone}`}>
    <div className="dashboard-kpi-topline">
      <span className="dashboard-kpi-icon"><Icon aria-hidden="true" size={16} /></span>
      {change && <span className={`dashboard-kpi-change ${change.startsWith('↓') ? 'is-down' : ''}`}>{change}</span>}
    </div>
    <span className="dashboard-kpi-label">{label}</span>
    <strong>{value}</strong>
  </div>;
}

function FinanceRow({ label, value, icon: Icon, tone, href }) {
  const content = <>
    <span className="dashboard-finance-icon"><Icon aria-hidden="true" size={16} /></span>
    <span>{label}</span>
    <strong>{value}</strong>
    <span className="dashboard-finance-chevron" aria-hidden="true">›</span>
  </>;
  return href ? <Link className={`dashboard-finance-row dashboard-finance-row-link dashboard-finance-${tone}`} href={href} aria-label={`Lihat rincian ${label.toLowerCase()}`}>{content}</Link>
    : <div className={`dashboard-finance-row dashboard-finance-${tone}`}>{content}</div>;
}

function TrendChart({ rows, valueKey = 'revenue', color, emptyMessage, totalLabel = 'Total' }) {
  const visible = (rows || []).slice(-14);
  const [showValues, setShowValues] = useState(false);
  const chartId = useId().replace(/:/g, '');
  const values = visible.map((row) => number(row[valueKey] ?? row.sales));
  if (!visible.length) return <p className="dashboard-report-empty">{emptyMessage}</p>;
  const max = Math.max(1, ...values);
  const chartPoints = values.map((value, index) => {
    const x = visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
    const y = 94 - (value / max) * 82;
    return [x, y];
  });
  const linePath = buildSmoothPath(chartPoints);
  const areaPath = `${linePath} L ${chartPoints.at(-1)[0]},94 L ${chartPoints[0][0]},94 Z`;
  return <div className="dashboard-report-chart" aria-label="Grafik tren laporan">
    <div className="dashboard-report-chart-plot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Grafik tren penjualan">
      <defs>
        <linearGradient id={`sales-area-gradient-${chartId}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity=".03" />
        </linearGradient>
      </defs>
      <line x1="0" y1="94" x2="100" y2="94" className="chart-axis" />
      <line x1="0" y1="66.67" x2="100" y2="66.67" className="chart-grid" />
      <line x1="0" y1="39.33" x2="100" y2="39.33" className="chart-grid" />
      <line x1="0" y1="12" x2="100" y2="12" className="chart-grid" />
      <path className="dashboard-report-chart-area" d={areaPath} fill={`url(#sales-area-gradient-${chartId})`} />
      <path className="dashboard-report-chart-line" d={linePath} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="dashboard-report-chart-points" aria-hidden="true">
        {chartPoints.map(([x, y], index) => <span
          key={`${visible[index].date}-${index}`}
          className="dashboard-report-chart-point"
          style={{ left: `${x}%`, top: `${y}%`, backgroundColor: color, boxShadow: `0 0 0 1px ${color}` }}
        />)}
      </div>
      <div className="dashboard-report-chart-ylabels" aria-hidden="true">
        <span>{rupiah(max)}</span><span>{rupiah(Math.round(max / 2))}</span><span>Rp0</span>
      </div>
    </div>
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

function ListCard({ title, icon, tone, items, emptyMessage, renderItem, meta }) {
  return <Section title={title} icon={icon} tone={tone} className="dashboard-list-card" meta={meta}>
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

export default function OlseraDashboardSections({ reportData, fallbackData, activeBranchId, period }) {
  const source = reportData || fallbackData;
  if (!source) return <section className="panel dashboard-report-loading"><p>Memuat laporan toko…</p></section>;

  const sourceSummary = reportData?.summary || fallbackData?.selected_summary || fallbackData?.summary || {};
  const previousSummary = reportData?.previous_summary || reportData?.comparison?.previous_summary || {};
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
  const detailPeriod = {
    start: reportData?.start || period?.start || fallbackData?.selected_period?.start || '',
    end: reportData?.end || period?.end || fallbackData?.selected_period?.end || '',
  };
  const detailBranch = reportData?.branch_id ?? activeBranchId ?? fallbackData?.selected_branch_id;
  const canViewFinanceDetails = Boolean(reportData);
  const detailHref = (type) => {
    const query = new URLSearchParams({ type });
    if (detailPeriod.start) query.set('start', detailPeriod.start);
    if (detailPeriod.end) query.set('end', detailPeriod.end);
    if (detailBranch != null && detailBranch !== '') query.set('branch_id', String(detailBranch));
    return `/reports/cashflow?${query.toString()}`;
  };

  return <div className="dashboard-report-layout dashboard-merged">
    <Section
      title="Ringkasan toko"
      description={reportData?.branch_name || 'Periode yang dipilih'}
      icon={BriefcaseBusiness}
      tone="denim"
      className="dashboard-overview-card"
      data-dashboard-section="summary"
      meta={{ value: rupiah(summary.gross_sales), sub: `${number(summary.transactions)} pesanan` }}
    >
      <div className="dashboard-kpi-grid">
        <MetricTile label="Pendapatan" value={rupiah(summary.gross_sales)} icon={CircleDollarSign} tone="denim" change={changePercent(summary.gross_sales, previousSummary.gross_sales)} />
        <MetricTile label="Pesanan" value={number(summary.transactions)} icon={ShoppingBag} tone="blue" change={changePercent(summary.transactions, previousSummary.transactions)} />
        <MetricTile label="Produk terjual" value={`${productsSold} pcs`} icon={PackageSearch} tone="teal" change={changePercent(productsSold, previousSummary.products_sold)} />
        <MetricTile label={fourthKpiLabel} value={fourthKpiValue} icon={CircleDollarSign} tone="purple" change={changePercent(hasProfit ? summary.net_profit : summary.expenses, hasProfit ? previousSummary.net_profit : previousSummary.expenses)} />
      </div>
      <div className="dashboard-overview-footline">
        <span>Margin keuntungan</span>
        <strong>{summary.profit_margin_percent != null ? percent(summary.profit_margin_percent) : '-'}</strong>
      </div>
    </Section>

    <Section
      title="Penjualan"
      description="Ringkasan penjualan pada periode yang dipilih."
      icon={ChartNoAxesCombined}
      tone="blue"
      className="dashboard-sales-summary"
      data-dashboard-section="sales"
      meta={{ value: rupiah(summary.gross_sales), sub: `${number(summary.transactions)} trx` }}
    >
      <div className="dashboard-report-focal"><span>Total penjualan</span><strong>{rupiah(summary.gross_sales)}</strong><small>{number(summary.transactions)} pesanan</small></div>
      <TrendChart rows={dailySales} color={colors.blue} totalLabel="Total penjualan" emptyMessage="Belum ada data penjualan pada periode ini." />
      <span className="dashboard-report-legend"><i style={{ backgroundColor: colors.blue }} />Penjualan</span>
      <div className="dashboard-sales-metrics">
        <FinanceRow label="Pembayaran" value={paymentTotal ? rupiah(paymentTotal) : rupiah(summary.gross_sales)} icon={CreditCard} tone="payment" href={canViewFinanceDetails ? detailHref('payments') : undefined} />
        <FinanceRow label="Pengeluaran" value={rupiah(summary.expenses)} icon={BriefcaseBusiness} tone="expense" href={canViewFinanceDetails ? detailHref('expenses') : undefined} />
        <FinanceRow label="Pengembalian" value={rupiah(summary.return_amount)} icon={AlertTriangle} tone="return" href={canViewFinanceDetails ? detailHref('returns') : undefined} />
      </div>
    </Section>

    <div className="dashboard-secondary-grid">
      <ListCard
        title="Produk terlaris"
        icon={ShoppingBag}
        tone="teal"
        items={products.slice(0, 5)}
        meta={{ value: `${products.reduce((total, product) => total + number(product.quantity_sold), 0)} pcs` }}
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
        meta={{ value: `${lowStock.length} produk` }}
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
