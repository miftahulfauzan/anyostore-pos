"use client";

import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = `${today.slice(0, 8)}01`;
const rp = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;

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
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.length ? (
              rows.map((row, index) => (
                <tr
                  key={
                    row.id ||
                    row.product_id ||
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
  const [period, setPeriod] = useState({ start: firstOfMonth, end: today });
  const [report, setReport] = useState(null);
  const [store, setStore] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const token = () =>
    typeof window === "undefined"
      ? ""
      : localStorage.getItem("pos_access_token");
  async function load(nextPeriod = period) {
    if (!token()) {
      window.location.assign("/");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `${apiUrl}/reports/overview?start=${nextPeriod.start}&end=${nextPeriod.end}`,
        { headers: { Authorization: `Bearer ${token()}` } },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message || "Laporan tidak dapat dimuat");
      setReport(body.data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    fetch(apiUrl + "/settings", {
      headers: { Authorization: "Bearer " + token() },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setStore(body?.data || null));
  }, []);
  const summary = report?.summary || {};
  const logo = store?.store_logo
    ? apiUrl.replace("/api", "") + store.store_logo
    : "";
  return (
    <AppShell
      title="Laporan"
      eyebrow="ANALISIS TOKO"
      actions={
        <>
          <a className="button-link secondary-link" href="/finance">
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
          <img src={logo} alt={"Logo " + (store?.store_name || "toko")} />
        )}
        <div>
          <strong>{store?.store_name || "Laporan toko"}</strong>
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
        <label>
          Mulai
          <input
            type="date"
            value={period.start}
            onChange={(event) =>
              setPeriod({ ...period, start: event.target.value })
            }
          />
        </label>
        <label>
          Sampai
          <input
            type="date"
            value={period.end}
            onChange={(event) =>
              setPeriod({ ...period, end: event.target.value })
            }
          />
        </label>
        <button onClick={() => load()} disabled={loading}>
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
            title="Daftar transaksi"
            subtitle="Transaksi dengan kasir dan tombol cetak ulang resi."
            className="report-table-transactions"
            rows={report.transactions}
            columns={[
              {
                label: "Waktu",
                render: (row) =>
                  new Date(row.created_at).toLocaleString("id-ID"),
              },
              { label: "Invoice", key: "invoice_no" },
              {
                label: "Kasir",
                render: (row) => (
                  <>
                    <strong>{row.cashier}</strong>
                    <small>{row.status}</small>
                  </>
                ),
              },
              {
                label: "Metode",
                key: "payment_method",
              },
              {
                label: "Total",
                render: (row) => rp(row.grand_total - (row.cancelled_amount || 0)),
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
            subtitle="Nilai pembayaran yang diterima per metode."
            rows={report.payment_methods}
            columns={[
              { label: "Metode", key: "payment_method" },
              { label: "Transaksi", key: "transactions" },
              { label: "Nilai pembayaran", render: (row) => rp(row.amount) },
            ]}
          />
          <ReportTable
            title="Laporan produk terjual"
            subtitle="Produk berdasarkan pendapatan, sampai 100 produk."
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
