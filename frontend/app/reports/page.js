"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import DateRangePresets from "../components/DateRangePresets";
import { localDateString, localMonthStartString } from "../lib/local-date";
import { labelFor, paymentLabels, statusLabels } from "../lib/ui-labels";
import { useAppSession } from "../components/AppStateProvider";
import { createRequestSequence } from "../components/app-state.cjs";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const todayStr = () => localDateString();
const firstOfMonthStr = () => localMonthStartString();
const rp = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
const formatBusinessDate = (value) => String(value || '').split('-').reverse().join('/');
const formatRecordedAt = (value) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'medium' });

function ReportTable({
  title,
  subtitle,
  columns,
  rows,
  empty = "Belum ada data untuk periode ini.",
  className = "",
}) {
  return (
    <section className={`panel report-panel ${className}`}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.label}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((row, index) => (
                <tr
                  key={
                    row.key || row.id ||
                    (row.product_id != null ? `${row.product_id}-${row.variant_detail || ''}` : null) ||
                    row.category_id ||
                    row.payment_method ||
                    row.date ||
                    index
                  }
                >
                  {columns.map((column) => (
                    <td key={column.label}>
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { user, activeBranchId } = useAppSession();
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [preset, setPreset] = useState("");
  const [report, setReport] = useState(null);
  const [storeContext, setStoreContext] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const reportLoadSequence = useRef(createRequestSequence());
  async function load(nextPeriod = period) {
    const requestId = reportLoadSequence.current.next();
    setLoading(true);
    setMessage("");
    setReport(null);
    try {
      const qs = new URLSearchParams({ start: nextPeriod.start, end: nextPeriod.end });
      if (user?.role === 'owner' && activeBranchId) qs.set('branch_id', activeBranchId);
      const response = await fetch(
        `${apiUrl}/reports/overview?${qs}`,
        { headers: {} },
      );
      const body = await response.json();
      if (!reportLoadSequence.current.isCurrent(requestId)) return;
      if (!response.ok)
        throw new Error(body.message || "Laporan tidak dapat dimuat");
      setReport(body.data);
    } catch (error) {
      if (reportLoadSequence.current.isCurrent(requestId)) setMessage(error.message);
    } finally {
      if (reportLoadSequence.current.isCurrent(requestId)) setLoading(false);
    }
  }
  useEffect(() => {
    if (!activeBranchId) return undefined;
    let current = true;
    if (user?.role === 'owner' && activeBranchId === 'all') {
      setStoreContext({ branchId: activeBranchId, data: null });
      return () => { current = false; };
    }
    const query = new URLSearchParams();
    if (user?.role === 'owner') query.set('branch_id', activeBranchId);
    const search = query.toString();
    fetch(`${apiUrl}/settings${search ? `?${search}` : ''}`, { headers: {} })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (current) setStoreContext({ branchId: activeBranchId, data: body?.data || null });
      })
      .catch(() => {
        if (current) setStoreContext({ branchId: activeBranchId, data: null });
      });
    return () => { current = false; };
  }, [activeBranchId, user?.role]);

  useEffect(() => {
    if (!period.start) return undefined;
    load(period);
    return () => { reportLoadSequence.current.next(); };
  }, [period.start, period.end, activeBranchId, user?.role]);

  useEffect(() => { if (!period.start) setPeriod({ start: firstOfMonthStr(), end: todayStr() }); }, []);

  const summary = report?.summary || {};
  const store = storeContext?.branchId === activeBranchId ? storeContext.data : null;
  const reportStore = String(report?.branch_id ?? '') === String(activeBranchId) ? report : null;
  const storeName = store?.store_name || reportStore?.branch_name || (activeBranchId === 'all' ? 'Semua Toko/Gudang' : activeBranchId ? 'Memuat toko…' : 'Laporan toko');
  const logo = store?.store_logo
    ? apiUrl.replace("/api", "") + store.store_logo
    : "";
  return (
    <AppShell
      title="Laporan"
      eyebrow="ANALISIS TOKO"
      actions={
        <>
          <a className="button-link" href="/reports/tax">
            Laporan Pajak
          </a>
          <a className="button-link" href="/finance">
            Keuangan
          </a>
          <button type="button" onClick={() => window.print()}>
            Cetak / Simpan PDF
          </button>
        </>
      }
    >
      <div className="report-brand">
        {logo && String(store?.show_logo) !== "false" && (
          <img src={logo} alt={"Logo " + storeName} />
        )}
        <div>
          <strong>{storeName}</strong>
          <span>{store?.store_address || ""}</span>
          <small>
            Periode {period.start} sampai {period.end}
          </small>
        </div>
        <h1 className="report-title">Laporan Ringkasan Toko</h1>
      </div>
      <section className="report-filter panel">
        <div>
          <h2>Periode laporan</h2>
          <p className="muted">
            Gunakan periode yang sama untuk semua laporan.
          </p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <DateRangePresets active={preset} onPick={(key, range) => { setPreset(key); if (range) setPeriod(range); }} />
        </div>
        <label>
          Mulai
          <input
            type="date"
            value={period.start}
            onChange={(event) => { setPreset('custom'); setPeriod({ ...period, start: event.target.value }); }}
          />
        </label>
        <label>
          Sampai
          <input
            type="date"
            value={period.end}
            onChange={(event) => { setPreset('custom'); setPeriod({ ...period, end: event.target.value }); }}
          />
        </label>
        <button type="button" onClick={() => load()} disabled={loading}>
          {loading ? "Memuat…" : "Tampilkan"}
        </button>
      </section>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {!report ? (
        <section className="panel">
          <p>Memuat laporan…</p>
        </section>
      ) : (
        <>
          <section className="metrics-grid report-metrics">
            <article className="metric-card">
              <span>Penjualan bersih</span>
              <strong>{rp(summary.revenue)}</strong>
              <small>{summary.transactions} transaksi</small>
            </article>
            <article className="metric-card">
              <span>Laba kotor</span>
              <strong>{rp(summary.gross_profit)}</strong>
              <small>Setelah harga modal produk</small>
            </article>
            <article className="metric-card">
              <span>Pengeluaran disetujui</span>
              <strong>{rp(summary.expenses)}</strong>
              <small>Periode yang dipilih</small>
            </article>
            <article className="metric-card">
              <span>Pemasukan lain</span>
              <strong>{rp(summary.income)}</strong>
              <small>Kas masuk selain penjualan</small>
            </article>
            <article className="metric-card">
              <span>Laba bersih</span>
              <strong>{rp(summary.net_profit)}</strong>
              <small>Diskon {rp(summary.discounts)}</small>
            </article>
          </section>
          <ReportTable
            title="Diskon, pembatalan, dan retur"
            subtitle="Diskon item dan transaksi; pembatalan memakai tanggal transaksi, retur memakai tanggal dicatat."
            rows={[
              { key: "discount-total", label: "Total diskon", amount: summary.discounts },
              { key: "discount-item", label: "Diskon item", amount: summary.item_discounts },
              { key: "discount-transaction", label: "Diskon transaksi", amount: summary.transaction_discounts },
              { key: "cancelled", label: `Pembatalan (${summary.cancelled_transactions || 0} transaksi)`, amount: summary.cancelled_amount },
              { key: "refund", label: `Refund retur (${summary.returns || 0} retur)`, amount: summary.refund_amount },
            ]}
            columns={[
              { label: "Rincian", key: "label" },
              { label: "Nilai", render: (row) => rp(row.amount) },
            ]}
          />
          <ReportTable
            title="Daftar transaksi"
            subtitle="Tanggal transaksi dapat berbeda dari waktu transaksi dicatat."
            className="report-table-transactions"
            rows={report.transactions}
            columns={[
              {
                label: "Tanggal transaksi",
                render: (row) => formatBusinessDate(row.transaction_date),
              },
              {
                label: "Dicatat",
                render: (row) => formatRecordedAt(row.created_at),
              },
              { label: "Invoice", key: "invoice_no" },
              {
                label: "Kasir",
                render: (row) => (
                  <>
                    <strong>{row.cashier}</strong>
                    <small>{labelFor(statusLabels, row.status)}</small>
                  </>
                ),
              },
              {
                label: "Metode",
                render: (row) => labelFor(paymentLabels, row.payment_method),
              },
              { label: "Diskon transaksi", render: (row) => rp(row.discount) },
              {
                label: "Total",
                render: (row) => rp(Number(row.grand_total) - Number(row.cancelled_amount || 0) - Number(row.refunded_amount || 0)),
              },
              {
                label: "Aksi",
                render: (row) => (
                  <a className="button-link" href={`/receipt/${row.id}`}>
                    Cetak resi
                  </a>
                ),
              },
            ]}
          />
          <ReportTable
            title="Laporan metode pembayaran"
            subtitle="Nilai per metode; pembayaran gabungan dirinci ke metode yang dipakai."
            rows={report.payment_methods}
            columns={[
              { label: "Metode", render: (row) => labelFor(paymentLabels, row.payment_method) },
              { label: "Transaksi", key: "transactions" },
              { label: "Nilai pembayaran", render: (row) => rp(row.amount) },
            ]}
          />
          <ReportTable
            title="Daftar pembatalan"
            subtitle="Maksimal 200 transaksi yang memiliki pembatalan tercatat pada tanggal transaksi."
            rows={report.cancellations}
            columns={[
              { label: "Tanggal transaksi", render: (row) => formatBusinessDate(row.transaction_date) },
              { label: "Dicatat", render: (row) => formatRecordedAt(row.created_at) },
              { label: "Invoice", key: "invoice_no" },
              { label: "Kasir", key: "cashier" },
              { label: "Qty batal", key: "cancelled_qty" },
              { label: "Alasan", render: (row) => row.cancel_reason || "-" },
              { label: "Nilai", render: (row) => rp(row.cancelled_amount) },
            ]}
          />
          <ReportTable
            title="Laporan produk terjual"
            subtitle="Rincian produk dan varian berdasarkan pendapatan, sampai 200 baris."
            className="report-table-products"
            rows={report.products}
            columns={[
              {
                label: "Produk",
                render: (row) => (
                  <>
                    <strong>{row.name}</strong>
                    <small>{row.sku || "Tanpa SKU"}</small>
                  </>
                ),
              },
              { label: "Kategori", render: (row) => row.category_name || "Tanpa kategori" },
              { label: "Barcode", render: (row) => row.barcode || "-" },
              { label: "Varian", render: (row) => row.variant_detail || "-" },
              { label: "Qty terjual", key: "quantity_sold" },
              { label: "Pendapatan", render: (row) => rp(row.revenue) },
              { label: "Modal", render: (row) => rp(row.cost_of_goods) },
              { label: "Laba kotor", render: (row) => rp(row.profit) },
            ]}
          />
          <ReportTable
            title="Penjualan berdasarkan kategori"
            subtitle="Kategori mengikuti katalog produk saat ini."
            rows={report.categories}
            columns={[
              { label: "Kategori", render: (row) => row.category_name || "Tanpa kategori" },
              { label: "Qty terjual", key: "quantity_sold" },
              { label: "Pendapatan", render: (row) => rp(row.revenue) },
              { label: "Modal", render: (row) => rp(row.cost_of_goods) },
              { label: "Laba kotor", render: (row) => rp(row.profit) },
            ]}
          />
          <section className="report-grid">
            <ReportTable
              title="Laporan kasir"
              subtitle="Penjualan per staf."
              rows={report.cashiers}
              columns={[
                {
                  label: "Staf",
                  render: (row) => (
                    <>
                      <strong>{row.name}</strong>
                      <small>{row.role}</small>
                    </>
                  ),
                },
                { label: "Transaksi", key: "transactions" },
                { label: "Penjualan", render: (row) => rp(row.revenue) },
              ]}
            />
            <ReportTable
              title="Pelanggan terbaik"
              subtitle="Pelanggan dengan nilai belanja tertinggi."
              rows={report.customers}
              columns={[
                {
                  label: "Pelanggan",
                  render: (row) => (
                    <>
                      <strong>{row.name}</strong>
                      <small>{row.phone || "Tanpa telepon"}</small>
                    </>
                  ),
                },
                { label: "Transaksi", key: "transactions" },
                { label: "Belanja", render: (row) => rp(row.revenue) },
              ]}
            />
          </section>
          <ReportTable
            title="Stok perlu perhatian"
            subtitle="Produk yang stoknya sama atau di bawah stok minimum."
            rows={report.low_stock}
            columns={[
              { label: "Produk", key: "name" },
              { label: "SKU", key: "sku" },
              { label: "Stok", key: "stock" },
              { label: "Stok minimum", key: "min_stock" },
            ]}
          />
          <ReportTable
            title="Penjualan harian"
            subtitle="Ringkasan transaksi per hari."
            rows={report.daily_sales}
            columns={[
              {
                label: "Tanggal",
                render: (row) => new Date(row.date).toLocaleDateString("id-ID"),
              },
              { label: "Transaksi", key: "transactions" },
              { label: "Penjualan", render: (row) => rp(row.revenue) },
            ]}
          />
          <ReportTable
            title="Penjualan per jam pencatatan"
            subtitle="Dikelompokkan menurut waktu WIB saat transaksi disimpan."
            rows={report.hourly_sales}
            columns={[
              { label: "Jam WIB", key: "hour" },
              { label: "Transaksi", key: "transactions" },
              { label: "Penjualan bersih", render: (row) => rp(row.revenue) },
            ]}
          />
          <ReportTable
            title="Ringkasan retur"
            subtitle="Retur dikelompokkan berdasarkan status dan tanggal pencatatan."
            rows={report.return_summary}
            columns={[
              { label: "Status", render: (row) => labelFor(statusLabels, row.status) },
              { label: "Jumlah retur", key: "returns_count" },
              { label: "Qty barang", key: "quantity_returned" },
              { label: "Refund disetujui", render: (row) => rp(row.refund_amount) },
            ]}
          />
          <ReportTable
            title="Daftar retur"
            subtitle="Maksimal 200 retur yang dicatat pada periode ini."
            rows={report.returns}
            columns={[
              { label: "Waktu dicatat", render: (row) => formatRecordedAt(row.created_at) },
              { label: "No. retur", key: "return_no" },
              { label: "Invoice", key: "invoice_no" },
              { label: "Dibuat oleh", key: "created_by_name" },
              { label: "Keterangan", render: (row) => row.reason || "-" },
              { label: "Qty", key: "quantity_returned" },
              { label: "Status", render: (row) => labelFor(statusLabels, row.status) },
              { label: "Refund", render: (row) => rp(row.refund_amount) },
            ]}
          />
          {user?.role === 'owner' && activeBranchId === 'all' && (
            <ReportTable
              title="Perbandingan antar toko"
              subtitle="Semua toko aktif untuk periode yang dipilih."
              rows={report.branch_comparison}
              columns={[
                { label: "Toko", key: "branch_name" },
                { label: "Transaksi", key: "transactions" },
                { label: "Penjualan bersih", render: (row) => rp(row.revenue) },
                { label: "Modal terjual", render: (row) => rp(row.cost_of_goods) },
                { label: "Pengeluaran", render: (row) => rp(row.expenses) },
                { label: "Pemasukan lain", render: (row) => rp(row.income) },
                { label: "Laba bersih", render: (row) => rp(row.net_profit) },
              ]}
            />
          )}
          <section className="panel report-panel report-stock-links">
            <div className="section-heading">
              <div>
                <h2>Laporan stok</h2>
                <p>Stok saat ini, mutasi, dan tren tersedia di halaman inventori.</p>
              </div>
            </div>
            <div className="button-row">
              <a className="button-link" href="/inventory/dashboard">Dashboard stok</a>
              <a className="button-link" href="/inventory/movements">Riwayat mutasi stok</a>
            </div>
          </section>
          <ReportTable
            title="Ringkasan tier harga"
            subtitle="Penjualan berdasarkan tier harga transaksi."
            rows={report.price_tiers}
            columns={[
              {
                label: "Tier",
                render: (row) => {
                  const labels = {
                    retail: "Retail",
                    semi_grosir: "Semi Grosir",
                    grosir_seri: "Grosir Seri",
                  };
                  return (
                    <span className={`tier-badge ${row.price_tier}`}>
                      {labels[row.price_tier] || row.price_tier}
                    </span>
                  );
                },
              },
              { label: "Transaksi", key: "transactions" },
              { label: "Total Produk Terjual", key: "products_sold" },
              { label: "Penjualan", render: (row) => rp(row.revenue) },
            ]}
          />
        </>
      )}
    </AppShell>
  );
}
