'use client';

import Link from 'next/link';
import { useId } from 'react';
import {
  AlertTriangle,
  Flame,
  Package,
  PiggyBank,
  ReceiptText,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import AnimatedValue from '../components/AnimatedValue';

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

// Palet peringkat produk terlaris, sama dengan dashboard APK.
const rankTones = ['#B45309', '#334155', '#C2410C', '#1D4ED8', '#6D28D9'];

function Section({ title, tone = 'denim', icon, meta, children, className = '', ...props }) {
  return <section className={`panel dashboard-report-section report-tone-${tone} dashboard-apk-card ${className}`} {...props}>
    <div className="section-heading dashboard-report-heading section-head">
      <div className="section-head-main dashboard-apk-heading-main">
        {icon
          ? <span className={`dashboard-apk-heading-icon is-${tone}`} aria-hidden="true">{icon}</span>
          : <span className="section-accent" aria-hidden="true" />}
        <h2>{title}</h2>
      </div>
      {meta ? (
        <span className="section-head-meta dashboard-apk-pill">
          <strong>{meta.value}</strong>
          {meta.sub ? <small> · {meta.sub}</small> : null}
        </span>
      ) : null}
    </div>
    {children}
  </section>;
}

function ChangeChip({ change, lead = false, suffix = '' }) {
  const has = Boolean(change);
  const down = has && change.startsWith('↓');
  const className = `dashboard-kpi-change${lead ? ' dashboard-apk-change-lead' : ''}${down ? ' is-down' : ''}${has ? '' : ' is-empty'}`;
  return <span className={className}>{has ? change : '-'}{has ? suffix : ''}</span>;
}

function SummaryHero({ value, change }) {
  return <div className="dashboard-apk-hero">
    <span className="dashboard-apk-hero-label">Penjualan</span>
    <strong><AnimatedValue value={value} money /></strong>
    <ChangeChip change={change} lead suffix=" vs periode lalu" />
  </div>;
}

function SummaryTile({ tone, icon, label, countTo, change, money = false, suffix = '' }) {
  return <article className={`dashboard-kpi-tile dashboard-apk-tile dashboard-apk-tile-${tone}`}>
    <span className="dashboard-apk-tile-icon" aria-hidden="true">{icon}</span>
    <span className="dashboard-kpi-label">{label}</span>
    <strong><AnimatedValue value={countTo} money={money} suffix={suffix} /></strong>
    <ChangeChip change={change} />
  </article>;
}

function FinanceRow({ label, value, tone, href }) {
  const content = <>
    <span>{label}</span>
    <strong>{value}</strong>
  </>;
  return href
    ? <Link className={`dashboard-finance-row dashboard-finance-row-link dashboard-finance-${tone}`} href={href} aria-label={`Lihat rincian ${label.toLowerCase()}`}>{content}</Link>
    : <div className={`dashboard-finance-row dashboard-finance-${tone}`}>{content}</div>;
}

function TrendChart({ rows, valueKey = 'revenue', color, emptyMessage }) {
  const visible = (rows || []).slice(-14);
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
    <span className="dashboard-report-chart-max">tertinggi {rupiah(max)}</span>
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
        <path className="dashboard-report-chart-line" d={linePath} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" pathLength="1" />
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
  </div>;
}

function EmptyList({ message }) {
  return <p className="dashboard-report-empty dashboard-apk-empty">{message}</p>;
}

function productSubtitle(product) {
  const name = String(product.name || '').trim().toLowerCase();
  const sku = String(product.sku || '').trim();
  if (sku && sku.toLowerCase() !== name) return sku;
  const category = String(product.category_name || '').trim();
  if (category && category.toLowerCase() !== name) return category;
  return '';
}

function BestSellerRow({ product, index, maxValue }) {
  const tone = rankTones[index % rankTones.length];
  const value = number(product.quantity_sold);
  const ratio = maxValue <= 0 ? 0 : Math.min(100, Math.max(5, (value / maxValue) * 100));
  const subtitle = productSubtitle(product);
  return <div className="dashboard-list-item">
    <div className="dashboard-list-row dashboard-apk-product-row">
      <span className="dashboard-apk-rank" style={{ '--rank-tone': tone }}>{index + 1}</span>
      <div className="dashboard-apk-product-main">
        <div className="dashboard-apk-product-line">
          <strong className="dashboard-apk-product-name">{product.name || '-'}</strong>
          <b className="dashboard-apk-product-value">{value.toLocaleString('id-ID')} pcs</b>
        </div>
        {subtitle ? <small className="dashboard-apk-product-sub">{subtitle}</small> : null}
        <span className="dashboard-list-track dashboard-apk-track" aria-hidden="true" style={{ '--rank-tone': tone }}>
          <i style={{ width: `${ratio}%` }} />
        </span>
      </div>
    </div>
  </div>;
}

function LowStockRow({ product }) {
  const stock = number(product.stock);
  const minStock = number(product.min_stock);
  const isOut = stock <= 0;
  const status = stock < 0 ? 'MINUS' : stock === 0 ? 'HABIS' : 'MENIPIS';
  const sku = productSubtitle(product);
  return <div className="dashboard-list-item">
    <div className="dashboard-list-row dashboard-apk-lowstock-row">
      <span className={`dashboard-apk-stock-dot${isOut ? ' is-out' : ' is-low'}`} aria-hidden="true" />
      <div className="dashboard-apk-product-main">
        <strong className="dashboard-apk-product-name">{product.name || '-'}</strong>
        {sku ? <small className="dashboard-apk-product-sub">{sku}</small> : null}
      </div>
      <div className="dashboard-apk-lowstock-side">
        <span className={`dashboard-apk-stock-pill${isOut ? ' is-out' : ' is-low'}`}>{status}</span>
        <small className="dashboard-list-stock">{stock} / min {minStock}</small>
      </div>
    </div>
  </div>;
}

function normalizeRows(rows, fallbackRows) {
  return (rows || fallbackRows || []).map((row) => ({
    ...row,
    revenue: row.revenue ?? row.sales ?? 0,
  }));
}

export default function OlseraDashboardSections({ reportData, fallbackData, activeBranchId, period, role }) {
  const fallback = role === 'kasir' ? fallbackData : null;
  const source = reportData || fallback;
  if (!source) return <section className="panel dashboard-report-loading"><p>Memuat laporan toko…</p></section>;

  const previousSummary = reportData?.previous_summary || reportData?.comparison?.previous_summary || {};
  const sourceSummary = reportData?.summary || fallback?.selected_summary || fallback?.summary || {};
  const summary = {
    ...sourceSummary,
    gross_sales: sourceSummary.gross_sales ?? sourceSummary.revenue ?? sourceSummary.sales ?? 0,
    transactions: sourceSummary.transactions ?? 0,
    expenses: sourceSummary.expenses ?? 0,
    return_amount: sourceSummary.return_amount ?? sourceSummary.refund_amount ?? 0,
  };
  const dailySales = normalizeRows(reportData?.daily_sales, fallback?.selected_sales_trend || fallback?.sales_trend);
  const methods = reportData?.payment_methods || fallback?.selected_payment_breakdown || fallback?.payment_breakdown || [];
  const products = reportData?.products || fallback?.products || [];
  const lowStock = reportData?.low_stock || fallback?.low_stock || [];
  const productsSold = summary.products_sold != null
    ? number(summary.products_sold)
    : products.reduce((total, product) => total + number(product.quantity_sold), 0);
  const paymentTotal = methods.reduce((total, method) => total + number(method.amount ?? method.total), 0);
  const isOwner = role === 'owner';
  const hasProfit = isOwner && reportData?.summary?.net_profit != null;
  const fourthKpiLabel = hasProfit ? 'Laba bersih' : 'Pengeluaran';
  const fourthKpiValue = hasProfit ? number(summary.net_profit) : number(summary.expenses);
  const detailPeriod = {
    start: reportData?.start || period?.start || fallback?.selected_period?.start || '',
    end: reportData?.end || period?.end || fallback?.selected_period?.end || '',
  };
  const detailBranch = reportData?.branch_id ?? activeBranchId ?? fallback?.selected_branch_id;
  const canViewFinanceDetails = Boolean(reportData);
  const detailHref = (type) => {
    const query = new URLSearchParams({ type });
    if (detailPeriod.start) query.set('start', detailPeriod.start);
    if (detailPeriod.end) query.set('end', detailPeriod.end);
    if (detailBranch != null && detailBranch !== '') query.set('branch_id', String(detailBranch));
    return `/reports/cashflow?${query.toString()}`;
  };
  const topProducts = [...products]
    .sort((a, b) => number(b.quantity_sold) - number(a.quantity_sold))
    .slice(0, 5);
  const topProductMax = Math.max(1, number(topProducts[0]?.quantity_sold));

  return <div className="dashboard-report-layout dashboard-merged dashboard-apk-dashboard">
    <Section
      title="Ringkasan toko"
      tone="denim"
      className="dashboard-overview-card dashboard-apk-summary-card"
      data-dashboard-section="summary"
      meta={{ value: `${number(summary.transactions).toLocaleString('id-ID')} pesanan` }}
    >
      <div className="dashboard-kpi-grid">
        <SummaryHero
          value={summary.gross_sales}
          change={changePercent(summary.gross_sales, previousSummary.gross_sales)}
        />
        <div className="dashboard-apk-tiles">
          <SummaryTile
            tone="order"
            icon={<ReceiptText size={14} />}
            label="Pesanan"
            countTo={summary.transactions}
            change={changePercent(summary.transactions, previousSummary.transactions)}
          />
          <SummaryTile
            tone="product"
            icon={<Package size={14} />}
            label="Produk terjual"
            countTo={productsSold}
            suffix=" pcs"
            change={changePercent(productsSold, previousSummary.products_sold)}
          />
          <SummaryTile
            tone={hasProfit ? 'profit' : 'spend'}
            icon={hasProfit ? <PiggyBank size={14} /> : <Wallet size={14} />}
            label={fourthKpiLabel}
            countTo={fourthKpiValue}
            money
            change={changePercent(hasProfit ? summary.net_profit : summary.expenses, hasProfit ? previousSummary.net_profit : previousSummary.expenses)}
          />
        </div>
      </div>
      {isOwner && <div className="dashboard-overview-footline">
        <span>Margin keuntungan</span>
        <strong>{summary.profit_margin_percent != null ? percent(summary.profit_margin_percent) : '-'}</strong>
      </div>}
    </Section>

    <Section
      title="Penjualan"
      tone="blue"
      className="dashboard-sales-summary"
      data-dashboard-section="sales"
      icon={<TrendingUp size={16} />}
      meta={{ value: `${number(summary.transactions).toLocaleString('id-ID')} trx` }}
    >
      <TrendChart rows={dailySales} color={colors.blue} emptyMessage="Belum ada data penjualan pada periode ini." />
      <span className="dashboard-report-legend"><i style={{ backgroundColor: colors.blue }} />Penjualan</span>
      <div className="dashboard-sales-metrics">
        <FinanceRow label="Pembayaran" value={paymentTotal ? rupiah(paymentTotal) : rupiah(summary.gross_sales)} tone="payment" href={canViewFinanceDetails ? detailHref('payments') : undefined} />
        <FinanceRow label="Pengeluaran" value={rupiah(summary.expenses)} tone="expense" href={canViewFinanceDetails ? detailHref('expenses') : undefined} />
        <FinanceRow label="Pengembalian" value={rupiah(summary.return_amount)} tone="return" href={canViewFinanceDetails ? detailHref('returns') : undefined} />
      </div>
    </Section>

    <div className="dashboard-secondary-grid">
      <Section
        title="Produk terlaris"
        tone="teal"
        className="dashboard-list-card"
        icon={<Flame size={16} />}
        meta={{ value: `${productsSold.toLocaleString('id-ID')} pcs` }}
      >
        {topProducts.length
          ? topProducts.map((product, index) => <BestSellerRow
            key={`${product.id || product.name || 'product'}-${index}`}
            product={product}
            index={index}
            maxValue={topProductMax}
          />)
          : <EmptyList message="Belum ada produk terlaris pada periode ini." />}
      </Section>
      <Section
        title="Stok rendah"
        tone="terracotta"
        className="dashboard-list-card"
        icon={<AlertTriangle size={16} />}
        meta={{ value: `${lowStock.length} produk` }}
      >
        {lowStock.length
          ? lowStock.slice(0, 5).map((product, index) => <LowStockRow key={`${product.id || product.name || 'stock'}-${index}`} product={product} />)
          : <EmptyList message="Tidak ada stok yang perlu diperiksa." />}
      </Section>
    </div>

    <div className="dashboard-summary-footnote">
      <span>Data mengikuti periode dan toko/gudang yang sedang dipilih.</span>
    </div>
  </div>;
}