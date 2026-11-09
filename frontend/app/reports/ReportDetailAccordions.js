'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  Boxes,
  ChevronDown,
  CreditCard,
  FileDown,
  PackageSearch,
  Printer,
  ReceiptText,
  RefreshCcw,
  ShoppingBag,
  Tags,
  Users,
} from 'lucide-react';
import { labelFor, paymentLabels, statusLabels } from '../lib/ui-labels';
import { createPrintWindow, populatePrintWindow } from '../lib/print-utils';

const rp = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const formatBusinessDate = (value) => String(value || '').split('-').reverse().join('/');
const formatRecordedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '-');
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

function detailCell(column, row) {
  const value = column.render ? column.render(row) : row[column.key];
  return value ?? '-';
}

function detailRowKey(row, index) {
  return row.key || row.id ||
    (row.product_id != null ? `${row.product_id}-${row.variant_detail || ''}` : null) ||
    row.category_id || row.payment_method || row.date || index;
}

function DetailDisclosureList({ columns, rows, empty, summary, summaryValue }) {
  const firstColumn = columns[0];
  const lastColumn = columns[columns.length - 1];
  return (
    <div className="report-detail-disclosures">
      {rows?.length ? rows.map((row, index) => (
        <details className="report-product-disclosure report-detail-disclosure" key={detailRowKey(row, index)}>
          <summary>
            <span className="report-product-disclosure-title">
              {summary ? summary(row) : <strong>{detailCell(firstColumn, row)}</strong>}
            </span>
            <span className="report-product-disclosure-total">
              {summaryValue ? summaryValue(row) : <strong>{detailCell(lastColumn, row)}</strong>}
            </span>
            <ChevronDown aria-hidden="true" size={18} />
          </summary>
          <div className="report-detail-disclosure-body">
            {columns.map((column) => (
              <div key={column.label}>
                <span>{column.label}</span>
                <div className="report-detail-disclosure-value">{detailCell(column, row)}</div>
              </div>
            ))}
          </div>
        </details>
      )) : <p className="report-product-empty">{empty}</p>}
    </div>
  );
}

function DetailTable({ title, subtitle, columns, rows, empty = 'Belum ada data untuk periode ini.', className = '', summary, summaryValue }) {
  return (
    <section className={`report-detail-table-block ${className}`}>
      <div className="report-detail-table-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="report-detail-table-count">{rows?.length || 0} data</span>
      </div>
      <DetailDisclosureList columns={columns} rows={rows} empty={empty} summary={summary} summaryValue={summaryValue} />
    </section>
  );
}

function ProductDetailList({ rows, openAll = false }) {
  return (
    <section className="report-detail-table-block report-detail-product-list">
      <div className="report-detail-table-heading">
        <div>
          <h3>Laporan produk terjual</h3>
          <p>Ketuk produk untuk membuka rincian SKU, stok, pendapatan, modal, dan laba.</p>
        </div>
        <span className="report-detail-table-count">{rows?.length || 0} data</span>
      </div>
      <div className="report-product-disclosures">
        {rows?.length ? rows.map((row, index) => {
          const productKey = row.key || row.id || `${row.product_id || 'product'}-${row.variant_detail || index}`;
          return (
            <details className="report-product-disclosure" key={productKey} open={openAll || undefined}>
              <summary>
                <span className="report-product-disclosure-title">
                  <strong>{row.name || 'Produk tanpa nama'}</strong>
                  <small>{row.sku || 'Tanpa SKU'}</small>
                </span>
                <span className="report-product-disclosure-total">
                  <strong>{row.quantity_sold || 0} pcs</strong>
                  <small>{rp(row.revenue)}</small>
                </span>
                <ChevronDown aria-hidden="true" size={18} />
              </summary>
              <div className="report-product-disclosure-body">
                <div><span>SKU</span><strong>{row.sku || 'Tanpa SKU'}</strong></div>
                <div><span>Kategori</span><strong>{row.category_name || 'Tanpa kategori'}</strong></div>
                <div><span>Barcode</span><strong>{row.barcode || '-'}</strong></div>
                <div><span>Varian</span><strong>{row.variant_detail || '-'}</strong></div>
                <div><span>Qty terjual</span><strong>{row.quantity_sold || 0}</strong></div>
                <div><span>Pendapatan</span><strong>{rp(row.revenue)}</strong></div>
                <div><span>Modal</span><strong>{rp(row.cost_of_goods)}</strong></div>
                <div><span>Laba kotor</span><strong>{rp(row.profit)}</strong></div>
              </div>
            </details>
          );
        }) : <p className="report-product-empty">Belum ada produk terjual untuk periode ini.</p>}
      </div>
    </section>
  );
}

function ReportActionBar({ onPdf, onPrint }) {
  return (
    <div className="report-detail-actions" aria-label="Aksi laporan">
      <button type="button" className="report-detail-action report-detail-action-secondary" onClick={onPdf}>
        <FileDown aria-hidden="true" size={16} />
        Lihat PDF
      </button>
      <button type="button" className="report-detail-action report-detail-action-primary" onClick={onPrint}>
        <Printer aria-hidden="true" size={16} />
        Cetak
      </button>
    </div>
  );
}

function DetailGroup({ groupKey, title, description, icon: Icon, tone, count, expanded, printActive, onToggle, onPdf, onPrint, children }) {
  const panelId = `report-detail-panel-${groupKey}`;
  return (
    <section
      className={`report-detail-accordion report-detail-accordion-${tone}${expanded ? ' is-expanded' : ''}`}
      data-report-key={groupKey}
      data-report-print-active={printActive ? 'true' : 'false'}
    >
      <button
        type="button"
        className="report-detail-accordion-trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        title={description}
      >
        <span className="report-detail-accordion-accent" aria-hidden="true" />
        <span className="report-detail-accordion-icon"><Icon aria-hidden="true" size={18} /></span>
        <span className="report-detail-accordion-copy">
          <strong>{title}</strong>
        </span>
        <span className="report-detail-accordion-meta">{count}</span>
        <ChevronDown aria-hidden="true" className="report-detail-accordion-chevron" size={18} />
      </button>
      {expanded && (
        <div id={panelId} className="report-detail-accordion-body">
          <ReportActionBar onPdf={onPdf} onPrint={onPrint} />
          <div className="report-detail-accordion-content">{children}</div>
        </div>
      )}
    </section>
  );
}

function countRows(...lists) {
  return lists.reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0);
}

export default function ReportDetailAccordions({ report, user, activeBranchId }) {
  const [expanded, setExpanded] = useState('transactions');
  const [printTarget, setPrintTarget] = useState(null);
  const summary = report?.summary || {};
  const isOwnerAll = user?.role === 'owner' && activeBranchId === 'all';

  useEffect(() => {
    const reset = () => setPrintTarget(null);
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  const requestPrint = (groupKey, mode = 'print') => {
    const printWindow = createPrintWindow();
    if (!printWindow) return;
    setExpanded(groupKey);
    setPrintTarget(groupKey);
    window.setTimeout(() => {
      populatePrintWindow(printWindow, {
        selector: '.app-content',
        title: `Laporan ${groupKey}`,
        autoPrint: mode === 'print',
      });
      window.setTimeout(() => setPrintTarget(null), mode === 'print' ? 2000 : 300);
    }, 120);
  };

  const transactions = report?.transactions || [];
  const cancellations = report?.cancellations || [];
  const products = report?.products || [];
  const categories = report?.categories || [];
  const paymentMethods = report?.payment_methods || [];
  const cashiers = report?.cashiers || [];
  const customers = report?.customers || [];
  const lowStock = report?.low_stock || [];
  const returnSummary = report?.return_summary || [];
  const returns = report?.returns || [];
  const dailySales = report?.daily_sales || [];
  const hourlySales = report?.hourly_sales || [];
  const branchComparison = report?.branch_comparison || [];
  const priceTiers = report?.price_tiers || [];
  const groups = [
    {
      key: 'transactions',
      title: 'Transaksi',
      description: 'Penjualan, diskon, pembatalan, dan invoice.',
      icon: ReceiptText,
      tone: 'denim',
      count: `${countRows(transactions, cancellations)} transaksi`,
    },
    {
      key: 'products',
      title: 'Produk',
      description: 'Produk terjual, kategori, stok rendah, dan tier harga.',
      icon: Boxes,
      tone: 'teal',
      count: `${countRows(products, categories, lowStock, priceTiers)} data`,
    },
    {
      key: 'payments',
      title: 'Pembayaran',
      description: 'Metode bayar, kasir, dan pelanggan terbaik.',
      icon: CreditCard,
      tone: 'blue',
      count: `${countRows(paymentMethods, cashiers, customers)} data`,
    },
    {
      key: 'returns',
      title: 'Retur',
      description: 'Ringkasan dan rincian barang yang dikembalikan.',
      icon: RefreshCcw,
      tone: 'purple',
      count: `${countRows(returnSummary, returns)} data`,
    },
    {
      key: 'analysis',
      title: 'Analisis periode',
      description: 'Tren harian, jam pencatatan, cabang, dan stok.',
      icon: BarChart3,
      tone: 'orange',
      count: `${countRows(dailySales, hourlySales, branchComparison)} grafik`,
    },
  ];

  const renderGroup = (group) => {
    const groupProps = {
      groupKey: group.key,
      title: group.title,
      description: group.description,
      icon: group.icon,
      tone: group.tone,
      count: group.count,
      expanded: expanded === group.key,
      printActive: printTarget === group.key,
      onToggle: () => setExpanded(expanded === group.key ? null : group.key),
      onPdf: () => requestPrint(group.key, 'preview'),
      onPrint: () => requestPrint(group.key, 'print'),
    };
    if (group.key === 'transactions') {
      return (
        <DetailGroup {...groupProps}>
          <DetailTable
            title="Diskon, pembatalan, dan retur"
            subtitle="Nilai ringkasan pada periode yang dipilih."
            rows={[
              { key: 'discount-total', label: 'Total diskon', amount: summary.discounts },
              { key: 'discount-item', label: 'Diskon item', amount: summary.item_discounts },
              { key: 'discount-transaction', label: 'Diskon transaksi', amount: summary.transaction_discounts },
              { key: 'cancelled', label: `Pembatalan (${summary.cancelled_transactions || 0} transaksi)`, amount: summary.cancelled_amount },
              { key: 'refund', label: `Refund retur (${summary.returns || 0} retur)`, amount: summary.refund_amount },
            ]}
            columns={[{ label: 'Rincian', key: 'label' }, { label: 'Nilai', render: (row) => rp(row.amount) }]}
          />
          <DetailTable
            title="Daftar transaksi"
            subtitle="Tanggal transaksi dapat berbeda dari waktu transaksi dicatat."
            className="report-table-transactions"
            rows={transactions}
            columns={[
              { label: 'Tanggal transaksi', render: (row) => formatBusinessDate(row.transaction_date) },
              { label: 'Dicatat', render: (row) => formatRecordedAt(row.created_at) },
              { label: 'Invoice', key: 'invoice_no' },
              { label: 'Kasir', render: (row) => <><strong>{row.cashier}</strong><small>{labelFor(statusLabels, row.status)}</small></> },
              { label: 'Metode', render: (row) => labelFor(paymentLabels, row.payment_method) },
              { label: 'Diskon transaksi', render: (row) => rp(row.discount) },
              { label: 'Total', render: (row) => rp(Number(row.grand_total) - Number(row.cancelled_amount || 0) - Number(row.refunded_amount || 0)) },
              { label: 'Aksi', render: (row) => <a className="button-link" href={`/receipt/${row.id}`}>Cetak resi</a> },
            ]}
            summary={(row) => <><strong>{row.invoice_no || 'Tanpa invoice'}</strong><small>{formatBusinessDate(row.transaction_date)} · {row.cashier || 'Kasir'}</small></>}
            summaryValue={(row) => <><strong>{rp(Number(row.grand_total) - Number(row.cancelled_amount || 0) - Number(row.refunded_amount || 0))}</strong><small>{labelFor(paymentLabels, row.payment_method)}</small></>}
          />
          <DetailTable
            title="Daftar pembatalan"
            subtitle="Transaksi yang memiliki pembatalan pada periode ini."
            rows={cancellations}
            columns={[
              { label: 'Tanggal transaksi', render: (row) => formatBusinessDate(row.transaction_date) },
              { label: 'Dicatat', render: (row) => formatRecordedAt(row.created_at) },
              { label: 'Invoice', key: 'invoice_no' },
              { label: 'Kasir', key: 'cashier' },
              { label: 'Qty batal', key: 'cancelled_qty' },
              { label: 'Alasan', render: (row) => row.cancel_reason || '-' },
              { label: 'Nilai', render: (row) => rp(row.cancelled_amount) },
            ]}
            summary={(row) => <><strong>{row.invoice_no || 'Tanpa invoice'}</strong><small>{formatBusinessDate(row.transaction_date)} · {row.cashier || 'Kasir'}</small></>}
            summaryValue={(row) => <strong>{rp(row.cancelled_amount)}</strong>}
          />
        </DetailGroup>
      );
    }
    if (group.key === 'products') {
      return (
        <DetailGroup {...groupProps}>
          <ProductDetailList rows={products} openAll={groupProps.printActive} />
          <DetailTable
            title="Penjualan berdasarkan kategori"
            subtitle="Kategori mengikuti katalog produk saat ini."
            rows={categories}
            columns={[
              { label: 'Kategori', render: (row) => row.category_name || 'Tanpa kategori' },
              { label: 'Qty terjual', key: 'quantity_sold' },
              { label: 'Pendapatan', render: (row) => rp(row.revenue) },
              { label: 'Modal', render: (row) => rp(row.cost_of_goods) },
              { label: 'Laba kotor', render: (row) => rp(row.profit) },
            ]}
          />
          <DetailTable
            title="Stok perlu perhatian"
            subtitle="Produk yang stoknya sama atau di bawah stok minimum."
            rows={lowStock}
            columns={[{ label: 'Produk', key: 'name' }, { label: 'SKU', key: 'sku' }, { label: 'Stok', key: 'stock' }, { label: 'Stok minimum', key: 'min_stock' }]}
            summaryValue={(row) => <><strong>{row.stock || 0} pcs</strong><small>Min. {row.min_stock || 0} pcs</small></>}
          />
          <DetailTable
            title="Ringkasan tier harga"
            subtitle="Penjualan berdasarkan tier harga transaksi."
            rows={priceTiers}
            columns={[
              { label: 'Tier', render: (row) => <span className={`tier-badge ${row.price_tier}`}>{({ retail: 'Retail', semi_grosir: 'Semi Grosir', grosir_seri: 'Grosir Seri' })[row.price_tier] || row.price_tier}</span> },
              { label: 'Transaksi', key: 'transactions' },
              { label: 'Total Produk Terjual', key: 'products_sold' },
              { label: 'Penjualan', render: (row) => rp(row.revenue) },
            ]}
          />
        </DetailGroup>
      );
    }
    if (group.key === 'payments') {
      return (
        <DetailGroup {...groupProps}>
          <DetailTable
            title="Laporan metode pembayaran"
            subtitle="Nilai per metode; pembayaran gabungan dirinci ke metode yang dipakai."
            rows={paymentMethods}
            columns={[{ label: 'Metode', render: (row) => labelFor(paymentLabels, row.payment_method) }, { label: 'Transaksi', key: 'transactions' }, { label: 'Nilai pembayaran', render: (row) => rp(row.amount) }]}
          />
          <DetailTable
            title="Laporan kasir"
            subtitle="Penjualan per staf."
            rows={cashiers}
            columns={[
              { label: 'Staf', render: (row) => <><strong>{row.name}</strong><small>{row.source_system === 'olsera' ? 'Riwayat Olsera' : row.role}</small></> },
              { label: 'Transaksi', key: 'transactions' },
              { label: 'Penjualan', render: (row) => rp(row.revenue) },
            ]}
          />
          <DetailTable
            title="Pelanggan terbaik"
            subtitle="Pelanggan dengan nilai belanja tertinggi."
            rows={customers}
            columns={[
              { label: 'Pelanggan', render: (row) => <><strong>{row.name}</strong><small>{row.phone || 'Tanpa telepon'}</small></> },
              { label: 'Transaksi', key: 'transactions' },
              { label: 'Belanja', render: (row) => rp(row.revenue) },
            ]}
          />
        </DetailGroup>
      );
    }
    if (group.key === 'returns') {
      return (
        <DetailGroup {...groupProps}>
          <DetailTable
            title="Ringkasan retur"
            subtitle="Retur dikelompokkan berdasarkan status dan tanggal pencatatan."
            rows={returnSummary}
            columns={[{ label: 'Status', render: (row) => labelFor(statusLabels, row.status) }, { label: 'Jumlah retur', key: 'returns_count' }, { label: 'Qty barang', key: 'quantity_returned' }, { label: 'Refund disetujui', render: (row) => rp(row.refund_amount) }]}
          />
          <DetailTable
            title="Daftar retur"
            subtitle="Retur yang dicatat pada periode ini."
            rows={returns}
            columns={[
              { label: 'Waktu dicatat', render: (row) => formatRecordedAt(row.created_at) },
              { label: 'No. retur', key: 'return_no' },
              { label: 'Invoice', key: 'invoice_no' },
              { label: 'Dibuat oleh', key: 'created_by_name' },
              { label: 'Keterangan', render: (row) => row.reason || '-' },
              { label: 'Qty', key: 'quantity_returned' },
              { label: 'Status', render: (row) => labelFor(statusLabels, row.status) },
              { label: 'Refund', render: (row) => rp(row.refund_amount) },
            ]}
          />
        </DetailGroup>
      );
    }
    return (
      <DetailGroup {...groupProps}>
        <DetailTable
          title="Penjualan harian"
          subtitle="Ringkasan transaksi per hari."
          rows={dailySales}
          columns={[{ label: 'Tanggal', render: (row) => formatBusinessDate(row.date) }, { label: 'Transaksi', key: 'transactions' }, { label: 'Penjualan', render: (row) => rp(row.revenue) }]}
        />
        <DetailTable
          title="Penjualan per jam pencatatan"
          subtitle="Dikelompokkan menurut waktu WIB saat transaksi disimpan."
          rows={hourlySales}
          columns={[{ label: 'Jam WIB', key: 'hour' }, { label: 'Transaksi', key: 'transactions' }, { label: 'Penjualan bersih', render: (row) => rp(row.revenue) }]}
        />
        {isOwnerAll && (
          <DetailTable
            title="Perbandingan antar toko"
            subtitle="Semua toko aktif untuk periode yang dipilih."
            rows={branchComparison}
            columns={[
              { label: 'Toko', key: 'branch_name' },
              { label: 'Transaksi', key: 'transactions' },
              { label: 'Penjualan bersih', render: (row) => rp(row.revenue) },
              { label: 'Modal terjual', render: (row) => rp(row.cost_of_goods) },
              { label: 'Pengeluaran', render: (row) => rp(row.expenses) },
              { label: 'Pemasukan lain', render: (row) => rp(row.income) },
              { label: 'Laba bersih', render: (row) => rp(row.net_profit) },
            ]}
          />
        )}
        <section className="report-detail-links">
          <div>
            <h3>Laporan stok</h3>
            <p>Stok saat ini, mutasi, dan tren tersedia di halaman inventori.</p>
          </div>
          <div className="button-row">
            <a className="button-link" href="/inventory/dashboard"><PackageSearch aria-hidden="true" size={16} />Dashboard stok</a>
            <a className="button-link" href="/inventory/movements"><Tags aria-hidden="true" size={16} />Riwayat mutasi stok</a>
          </div>
        </section>
      </DetailGroup>
    );
  };

  return (
    <section className={`report-detail-accordions${printTarget ? ' has-print-target report-detail-print-target' : ''}`} data-print-target={printTarget || ''}>
      <div className="report-details-heading">
        <div>
          <span className="report-detail-eyebrow"><ShoppingBag aria-hidden="true" size={16} /> RINCIAN PERIODE</span>
          <h2>Laporan detail</h2>
          <p>Rincian transaksi, produk, pembayaran, retur, dan analisis periode.</p>
        </div>
        <Users aria-hidden="true" className="report-detail-heading-icon" size={28} />
      </div>
      <div className="report-detail-groups">
        {groups.map(renderGroup)}
      </div>
    </section>
  );
}
