"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Boxes, CalendarDays, ChartNoAxesCombined, CreditCard, FileText, PackageSearch, ReceiptText, RotateCcw, ShoppingBag, Store, Users, Truck } from "lucide-react";

const VIEWS = [
  { id: "sales", label: "Penjualan", icon: ChartNoAxesCombined },
  { id: "closing", label: "Penutupan", icon: CalendarDays },
  { id: "payments", label: "Pembayaran", icon: CreditCard },
  { id: "expenses", label: "Pengeluaran", icon: ReceiptText },
  { id: "returns", label: "Pengembalian", icon: RotateCcw },
  { id: "products", label: "Produk & margin", icon: ShoppingBag },
  { id: "inventory", label: "Stok & restok", icon: Boxes },
  { id: "channels", label: "Kanal", icon: Store },
  { id: "customers", label: "Pelanggan", icon: Users },
  { id: "suppliers", label: "Supplier", icon: Truck },
  { id: "tax", label: "PPN Masukan", icon: FileText },
];

const insightViews = new Set(["inventory", "channels", "customers", "suppliers"]);
const supportingViews = new Set(["expenses", "tax"]);
const number = (value) => Number(value || 0);
const fmtNumber = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(number(value));
const fmtRp = (value) => `Rp ${fmtNumber(value)}`;
const fmtPercent = (value) => `${number(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const fmtDate = (value) => value ? String(value).slice(0, 10).split("-").reverse().join("/") : "-";

async function fetchReportJson(url, signal) {
  const response = await fetch(url, { credentials: "include", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Laporan tidak dapat dimuat");
  return body;
}

async function loadTaxReport({ apiUrl, start, end, activeBranchId, user, signal }) {
  const branchIds = user?.role === "owner" && activeBranchId === "all"
    ? ((await fetchReportJson(`${apiUrl}/settings/branches`, signal)).data || [])
      .filter((branch) => branch.is_active)
      .map((branch) => branch.id)
    : [user?.role === "owner" ? activeBranchId : null];
  const reports = await Promise.all(branchIds.map(async (branchId) => {
    const query = new URLSearchParams({ start, end });
    if (branchId != null && branchId !== "") query.set("branch_id", branchId);
    return (await fetchReportJson(`${apiUrl}/tax/report?${query}`, signal)).data;
  }));
  if (!(user?.role === "owner" && activeBranchId === "all") && reports.length === 1) return reports[0];

  const sumFields = (source, fields, integerFields = []) => Object.fromEntries(fields.map((field) => [
    field,
    reports.reduce((total, report) => total + number(report?.[source]?.[field]), 0),
  ]).map(([field, value]) => [field, integerFields.includes(field) ? Math.round(value) : value]));
  const monthly = new Map();
  for (const report of reports) {
    for (const row of report.monthly || []) {
      const target = monthly.get(row.month) || { month: row.month, transactions: 0, gross_sales: 0, ppn_base: 0, ppn_keluaran: 0 };
      for (const field of ["transactions", "gross_sales", "ppn_base", "ppn_keluaran"]) target[field] += number(row[field]);
      monthly.set(row.month, target);
    }
  }
  const rates = [...new Set(reports.map((report) => String(report.tax_rate)))];
  return {
    store_name: "Semua toko/gudang",
    all_branches: true,
    tax_rate: rates.length === 1 ? reports[0]?.tax_rate : "gabungan",
    ppn_keluaran: sumFields("ppn_keluaran", ["transactions", "gross_sales", "ppn_base", "ppn_amount"], ["transactions"]),
    ppn_masukan: sumFields("ppn_masukan", ["orders", "total_purchase", "ppn_base", "ppn_amount"], ["orders"]),
    net_ppn: reports.reduce((total, report) => total + number(report.net_ppn), 0),
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

function downloadCsv(section, headers, rows) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const contents = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${contents}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `laporan-${section}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, helper, tone = "navy" }) {
  return (
    <article className={`analytics-report-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

function Panel({ title, hint, children }) {
  return (
    <section className="analytics-report-panel">
      <div className="analytics-report-panel-heading">
        <h3>{title}</h3>
        {hint ? <span>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children = "Belum ada data pada rentang ini." }) {
  return <p className="analytics-report-empty">{children}</p>;
}

function ReportHeading({ view, title, onExport, disabled = false, hideExport = false, children }) {
  const item = VIEWS.find((entry) => entry.id === view);
  const Icon = item?.icon || PackageSearch;
  return (
    <header className="analytics-report-heading">
      <div className="analytics-report-heading-icon"><Icon size={19} aria-hidden="true" /></div>
      <div className="analytics-report-heading-copy">
        <span>ANALITIK DENIM</span>
        <h2>{title || item?.label}</h2>
        <p>{children}</p>
      </div>
      {!hideExport ? <button className="analytics-report-export" type="button" onClick={onExport} disabled={disabled}>
        <Download size={16} aria-hidden="true" /> <span>CSV</span>
      </button> : null}
    </header>
  );
}

function ProductView({ data, isOwner }) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const tiers = Array.isArray(data?.price_tiers) ? data.price_tiers : [];
  const maxRevenue = Math.max(1, ...categories.map((row) => number(row.revenue)));
  const tierRevenue = tiers.reduce((total, row) => total + number(row.revenue), 0);
  const tierProfit = tiers.reduce((total, row) => total + number(row.profit), 0);
  const avgMargin = tierRevenue > 0 ? tierProfit * 100 / tierRevenue : 0;
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Produk terjual" value={`${fmtNumber(data?.summary?.products_sold)} pcs`} helper={`${products.length} produk teratas`} />
        <Kpi label="Laba kotor produk" value={fmtRp(tierProfit)} helper="Harga dan HPP yang tersimpan" tone="green" />
        {isOwner
          ? <Kpi label="Margin rata-rata" value={fmtPercent(avgMargin)} helper="Sesudah diskon dan retur" tone="blue" />
          : <Kpi label="Kategori tercatat" value={fmtNumber(categories.length)} helper="Pada periode terpilih" tone="blue" />}
      </div>
      <div className="analytics-report-columns">
        <Panel title={isOwner ? "Margin per tier harga" : "Laba per tier harga"} hint="Harga transaksi tercatat">
          {tiers.length ? <div className="analytics-report-list">
            {tiers.map((row) => {
              const margin = number(row.revenue) > 0 ? number(row.profit) * 100 / number(row.revenue) : 0;
              return <article className="analytics-report-row" key={row.price_tier || "lainnya"}>
                <div className="analytics-report-row-main">
                  <strong>{String(row.price_tier || "Tidak ditentukan").replaceAll("_", " ")}</strong>
                  <small>{fmtNumber(row.transactions)} transaksi · {fmtNumber(row.products_sold)} pcs</small>
                </div>
                <div className="analytics-report-row-value"><strong>{fmtRp(row.profit)}</strong><small>{isOwner ? `${fmtPercent(margin)} margin` : `${fmtRp(row.revenue)} omzet`}</small></div>
              </article>;
            })}
          </div> : <Empty />}
        </Panel>
        <Panel title="Penjualan per kategori" hint="Omzet dan laba tercatat">
          {categories.length ? <div className="analytics-report-bars">
            {categories.slice(0, 8).map((row) => <div className="analytics-report-bar-row" key={row.category_id || row.category_name}>
              <div className="analytics-report-bar-label"><strong>{row.category_name || "Tanpa kategori"}</strong><span>{fmtRp(row.revenue)}</span></div>
              <div className="analytics-report-bar-track"><i style={{ width: `${Math.max(3, number(row.revenue) * 100 / maxRevenue)}%` }} /></div>
              <small>{fmtRp(row.profit)} laba · {fmtNumber(row.quantity_sold)} pcs</small>
            </div>)}
          </div> : <Empty />}
        </Panel>
      </div>
      <Panel title="Produk teratas" hint="Diurutkan menurut omzet">
        {products.length ? <div className="analytics-report-list">
          {products.slice(0, 30).map((row, index) => {
            const margin = number(row.revenue) > 0 ? number(row.profit) * 100 / number(row.revenue) : 0;
            return <article className="analytics-report-row" key={`${row.product_id}-${row.variant_detail || ""}-${index}`}>
              <div className="analytics-report-row-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="analytics-report-row-main"><strong>{row.name}</strong><small>{row.category_name || "Tanpa kategori"} · {fmtNumber(row.quantity_sold)} pcs</small></div>
              <div className="analytics-report-row-value"><strong>{fmtRp(row.profit)}</strong><small>{isOwner ? `${fmtRp(row.revenue)} omzet · ${fmtPercent(margin)}` : `${fmtRp(row.revenue)} omzet`}</small></div>
            </article>;
          })}
        </div> : <Empty />}
      </Panel>
    </>
  );
}

function SalesSummary({ report }) {
  const summary = report?.summary || {};
  return (
    <>
      <div className="analytics-report-section-label">Ringkasan penjualan</div>
      <div className="analytics-report-kpis">
        <Kpi label="Total penjualan" value={fmtRp(summary.gross_sales ?? summary.revenue)} />
        <Kpi label="Transaksi" value={fmtNumber(summary.transactions)} tone="blue" />
        <Kpi label="Produk terjual" value={`${fmtNumber(summary.products_sold)} pcs`} tone="green" />
        <Kpi label="Diskon" value={fmtRp(summary.discounts)} tone="plum" />
      </div>
    </>
  );
}

function PaymentsView({ report }) {
  const summary = report?.summary || {};
  const methods = Array.isArray(report?.payment_methods) ? report.payment_methods : [];
  const total = methods.reduce((value, row) => value + number(row.amount), 0);
  const transactions = number(summary.transactions);
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Total pembayaran" value={fmtRp(total)} helper="Setelah pembatalan dan refund" />
        <Kpi label="Transaksi" value={fmtNumber(transactions)} tone="blue" />
        <Kpi label="Metode digunakan" value={fmtNumber(methods.length)} tone="green" />
        <Kpi label="Rata-rata transaksi" value={fmtRp(transactions ? total / transactions : 0)} tone="plum" />
      </div>
      <Panel title="Pembayaran per metode" hint={`${methods.length} metode pada periode ini`}>
        {methods.length ? <div className="analytics-report-list">
          {methods.map((row) => <article className="analytics-report-row" key={row.payment_method}>
            <div className="analytics-report-row-main"><strong>{String(row.payment_method || "Lainnya").toUpperCase()}</strong><small>{fmtNumber(row.transactions)} transaksi</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.amount)}</strong></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
    </>
  );
}

function ExpensesView({ report, data }) {
  const summary = report?.summary || {};
  const daily = Array.isArray(report?.daily_expenses) ? report.daily_expenses : [];
  const expenses = (Array.isArray(data?.expenses) ? data.expenses : []).filter((row) => row.status === "approved");
  const total = number(summary.expenses);
  const days = daily.length;
  const maxAmount = Math.max(1, ...daily.map((row) => number(row.amount)));
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Total pengeluaran" value={fmtRp(total)} />
        <Kpi label="Tanggal tercatat" value={`${fmtNumber(days)} hari`} tone="blue" />
        <Kpi label="Rata-rata per tanggal" value={fmtRp(days ? total / days : 0)} tone="plum" />
      </div>
      <Panel title="Pengeluaran per tanggal" hint="Catatan yang sudah disetujui">
        {daily.length ? <div className="analytics-report-bars">
          {daily.map((row) => <div className="analytics-report-bar-row" key={row.date}>
            <div className="analytics-report-bar-label"><strong>{fmtDate(row.date)}</strong><span>{fmtRp(row.amount)}</span></div>
            <div className="analytics-report-bar-track"><i style={{ width: `${Math.max(3, number(row.amount) * 100 / maxAmount)}%` }} /></div>
          </div>)}
        </div> : <Empty />}
      </Panel>
      <Panel title="Rincian pengeluaran" hint={`${fmtNumber(expenses.length)} data disetujui`}>
        {expenses.length ? <div className="analytics-report-list">
          {expenses.map((row) => <article className="analytics-report-row" key={row.id}>
            <div className="analytics-report-row-main">
              <strong>{row.name || row.category || "Pengeluaran"}</strong>
              <small>{fmtDate(row.expense_date)} · {row.category || "Tanpa kategori"} · {String(row.payment_method || "cash").toUpperCase()}{row.branch_name ? ` · ${row.branch_name}` : ""}</small>
              {row.notes ? <small>{row.notes}</small> : null}
            </div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.amount)}</strong></div>
          </article>)}
        </div> : <Empty />}
        {number(data?.total) > 100 ? <p className="analytics-report-note">Menampilkan maksimal 100 pengeluaran terbaru. Angka ringkasan menghitung seluruh data yang disetujui.</p> : null}
      </Panel>
    </>
  );
}

function ReturnsView({ report }) {
  const summary = report?.summary || {};
  const statusRows = Array.isArray(report?.return_summary) ? report.return_summary : [];
  const returns = Array.isArray(report?.returns) ? report.returns : [];
  const count = summary.returns ?? summary.return_count;
  const refund = summary.return_amount ?? summary.refund_amount;
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Total refund disetujui" value={fmtRp(refund)} />
        <Kpi label="Jumlah retur" value={fmtNumber(count)} tone="blue" />
        <Kpi label="Barang dikembalikan" value={`${fmtNumber(summary.returned_quantity)} pcs`} tone="green" />
      </div>
      <Panel title="Ringkasan pengembalian" hint="Dikelompokkan menurut status">
        {statusRows.length ? <div className="analytics-report-list">
          {statusRows.map((row) => <article className="analytics-report-row" key={row.status}>
            <div className="analytics-report-row-main"><strong>{row.status || "Tidak diketahui"}</strong><small>{fmtNumber(row.returns_count)} retur · {fmtNumber(row.quantity_returned)} pcs</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.refund_amount)}</strong><small>Refund disetujui</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <Panel title="Daftar pengembalian" hint={`${fmtNumber(returns.length)} data pada periode ini`}>
        {returns.length ? <div className="analytics-report-list">
          {returns.map((row) => <article className="analytics-report-row" key={`${row.return_no || row.id}-${row.invoice_no || ""}`}>
            <div className="analytics-report-row-main"><strong>{row.return_no || "Retur"} · {row.invoice_no || "Tanpa invoice"}</strong><small>{fmtDate(row.created_at)} · {row.created_by_name || "-"} · {row.status || "-"}</small><small>{row.reason || "Tanpa keterangan"}</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.refund_amount)}</strong><small>{fmtNumber(row.quantity_returned)} pcs</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
    </>
  );
}

function TaxView({ data }) {
  const output = data?.ppn_keluaran || {};
  const input = data?.ppn_masukan || {};
  const monthly = Array.isArray(data?.monthly) ? data.monthly : [];
  const maxAmount = Math.max(1, ...monthly.map((row) => number(row.ppn_keluaran)));
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="PPN keluaran" value={fmtRp(output.ppn_amount)} helper={`${fmtNumber(output.transactions)} transaksi`} />
        <Kpi label="PPN masukan" value={fmtRp(input.ppn_amount)} helper={`${fmtNumber(input.orders)} PO diterima`} tone="green" />
        <Kpi label="PPN bersih" value={fmtRp(data?.net_ppn)} helper="Keluaran dikurangi masukan" tone={number(data?.net_ppn) > 0 ? "amber" : "blue"} />
      </div>
      <div className="analytics-report-columns">
        <Panel title="PPN keluaran" hint="Dari penjualan">
          <div className="analytics-report-list">
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>Omzet</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(output.gross_sales)}</strong></div></article>
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>Dasar pengenaan</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(output.ppn_base)}</strong></div></article>
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>PPN keluaran</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(output.ppn_amount)}</strong></div></article>
          </div>
        </Panel>
        <Panel title="PPN masukan" hint="Dari purchase order diterima">
          <div className="analytics-report-list">
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>Total pembelian</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(input.total_purchase)}</strong></div></article>
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>Dasar pengenaan</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(input.ppn_base)}</strong></div></article>
            <article className="analytics-report-row"><div className="analytics-report-row-main"><strong>PPN masukan</strong></div><div className="analytics-report-row-value"><strong>{fmtRp(input.ppn_amount)}</strong></div></article>
          </div>
        </Panel>
      </div>
      <Panel title="Rincian bulanan" hint="PPN keluaran dan omzet">
        {monthly.length ? <div className="analytics-report-bars">
          {monthly.map((row) => <div className="analytics-report-bar-row" key={row.month}>
            <div className="analytics-report-bar-label"><strong>{row.month}</strong><span>{fmtRp(row.ppn_keluaran)}</span></div>
            <div className="analytics-report-bar-track"><i style={{ width: `${Math.max(3, number(row.ppn_keluaran) * 100 / maxAmount)}%` }} /></div>
            <small>{fmtNumber(row.transactions)} transaksi · omzet {fmtRp(row.gross_sales)}</small>
          </div>)}
        </div> : <Empty />}
      </Panel>
      <p className="analytics-report-note">{data?.all_branches ? "Tarif dan dasar pengenaan mengikuti pengaturan masing-masing toko." : `Tarif PPN: ${data?.tax_rate ?? 0}% · Harga ${data?.prices_include_tax ? "sudah termasuk" : "belum termasuk"} PPN.`}</p>
    </>
  );
}

function InventoryView({ data }) {
  const summary = data?.summary || {};
  const products = Array.isArray(data?.products) ? data.products : [];
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Nilai stok" value={fmtRp(summary.stock_value)} helper="Estimasi dari stok × biaya produk saat ini" />
        <Kpi label="Stok tersedia" value={`${fmtNumber(summary.available_units)} pcs`} helper={`${fmtNumber(summary.reserved_units)} pcs dicadangkan reseller`} tone="blue" />
        <Kpi label="Perlu dicek" value={`${fmtNumber(summary.low_stock_products)} produk`} helper={`${fmtNumber(summary.empty_products)} produk kosong`} tone="amber" />
        <Kpi label="Stok lambat" value={fmtRp(summary.slow_stock_value)} helper={`${fmtNumber(summary.slow_products)} produk tanpa penjualan ≥60 hari`} tone="plum" />
      </div>
      <Panel title="Saran restok" hint="Stok dan PO ikut diperhitungkan">
        {products.length ? <div className="analytics-report-list">
          {products.filter((row) => number(row.suggested_reorder) > 0 || number(row.available_stock) <= number(row.min_stock)).slice(0, 60).map((row) => <article className="analytics-report-row" key={row.id}>
            <div className="analytics-report-row-main"><strong>{row.name}</strong><small>{row.sku || "Tanpa SKU"} · {row.category_name}</small></div>
            <div className="analytics-report-row-stat"><span>Tersedia / min</span><strong>{fmtNumber(row.available_stock)} / {fmtNumber(row.min_stock)}</strong><small>{fmtNumber(row.reserved_units)} pcs dicadangkan</small></div>
            <div className="analytics-report-row-stat"><span>Terjual 30 hari</span><strong>{fmtNumber(row.units_sold_30d)} pcs</strong></div>
            <div className="analytics-report-row-value"><strong>{fmtNumber(row.suggested_reorder)} pcs</strong><small>Usulan restok · PO masuk {fmtNumber(row.incoming_units)}</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <Panel title="Stok lambat bergerak" hint={`${fmtRp(summary.slow_stock_value)} estimasi nilai stok lambat`}>
        {data?.slow_products?.length ? <div className="analytics-report-list">
          {data.slow_products.slice(0, 60).map((row) => <article className="analytics-report-row" key={`slow-${row.id}`}>
            <div className="analytics-report-row-main"><strong>{row.name}</strong><small>{row.sku || "Tanpa SKU"} · stok {fmtNumber(row.stock)} pcs</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(number(row.stock) * number(row.unit_cost))}</strong><small>{row.days_since_last_sale == null ? "Belum pernah tercatat terjual" : `Terakhir terjual ${fmtNumber(row.days_since_last_sale)} hari lalu`}</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <p className="analytics-report-note">{data?.note}</p>
    </>
  );
}

function ChannelView({ data }) {
  const summary = data?.summary || {};
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  const maxUnits = Math.max(1, ...channels.map((row) => number(row.units)));
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Barang keluar" value={`${fmtNumber(summary.units)} pcs`} helper="Mutasi stok keluar per kanal" />
        <Kpi label="Batch" value={fmtNumber(summary.batches)} helper={`${fmtNumber(summary.channels)} kanal aktif`} tone="blue" />
      </div>
      <Panel title="Distribusi kanal" hint="Berdasarkan jumlah barang">
        {channels.length ? <div className="analytics-report-bars">
          {channels.map((row) => <div className="analytics-report-bar-row" key={row.channel_name}>
            <div className="analytics-report-bar-label"><strong>{row.channel_name}</strong><span>{fmtNumber(row.units)} pcs</span></div>
            <div className="analytics-report-bar-track"><i style={{ width: `${Math.max(3, number(row.units) * 100 / maxUnits)}%` }} /></div>
            <small>{fmtNumber(row.batches)} batch · {fmtNumber(row.products)} produk</small>
          </div>)}
        </div> : <Empty />}
      </Panel>
      <p className="analytics-report-note">{data?.note}</p>
    </>
  );
}

function CustomerView({ data }) {
  const summary = data?.summary || {};
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Pelanggan aktif" value={fmtNumber(summary.active_customers)} helper="Membeli pada periode ini" />
        <Kpi label="Pelanggan baru" value={fmtNumber(summary.new_customers)} helper="Transaksi valid pertama" tone="blue" />
        <Kpi label="Pembelian ulang" value={fmtNumber(summary.repeat_customers)} helper="Pernah membeli sebelum periode" tone="green" />
        <Kpi label="Tidak aktif 90 hari" value={fmtNumber(summary.lapsed_customers)} helper="Sampai akhir periode" tone="amber" />
      </div>
      <Panel title="Pelanggan teratas" hint={fmtRp(summary.customer_revenue)}>
        {customers.length ? <div className="analytics-report-list">
          {customers.slice(0, 50).map((row, index) => <article className="analytics-report-row" key={row.customer_id}>
            <div className="analytics-report-row-rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="analytics-report-row-main"><strong>{row.name}</strong><small>{row.phone || "Tanpa nomor"} · terakhir {fmtDate(row.last_purchase)}</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.revenue)}</strong><small>{fmtNumber(row.transactions)} transaksi{row.is_new ? " · baru" : ""}</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <p className="analytics-report-note">{data?.note}</p>
    </>
  );
}

function SupplierView({ data }) {
  const summary = data?.summary || {};
  const suppliers = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  return (
    <>
      <div className="analytics-report-kpis">
        <Kpi label="Total PO" value={fmtNumber(summary.orders)} helper={fmtRp(summary.order_value)} />
        <Kpi label="Masih terbuka" value={fmtNumber(summary.open_orders)} helper={fmtRp(summary.pending_value)} tone="blue" />
        <Kpi label="Terlambat" value={fmtNumber(summary.overdue_orders)} helper="PO terbuka melewati tanggal perkiraan" tone="amber" />
        <Kpi label="Ke penerimaan pertama" value={summary.avg_first_receipt_days == null ? "-" : `${number(summary.avg_first_receipt_days).toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`} helper="Rata-rata PO yang sudah mulai diterima" tone="green" />
      </div>
      <Panel title="Ringkasan supplier" hint="Nilai dan jumlah PO">
        {suppliers.length ? <div className="analytics-report-list">
          {suppliers.map((row) => <article className="analytics-report-row" key={row.supplier_id}>
            <div className="analytics-report-row-main"><strong>{row.supplier_name}</strong><small>{fmtNumber(row.orders)} PO · {fmtNumber(row.pending_units)} pcs belum diterima</small></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.order_value)}</strong><small>{fmtRp(row.pending_value)} belum diterima · {fmtNumber(row.overdue_orders)} terlambat</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <Panel title="Daftar purchase order" hint="Terlambat ditampilkan lebih dulu">
        {orders.length ? <div className="analytics-report-list">
          {orders.slice(0, 80).map((row) => <article className={`analytics-report-row${row.overdue ? " is-overdue" : ""}`} key={row.id}>
            <div className="analytics-report-row-main"><strong>{row.po_number || `PO #${row.id}`} · {row.supplier_name}</strong><small>{fmtDate(row.order_date)} · target {fmtDate(row.expected_date)} · {row.status}</small></div>
            <div className="analytics-report-row-stat"><span>Barang</span><strong>{fmtNumber(row.received_units)} / {fmtNumber(row.ordered_units)} pcs</strong></div>
            <div className="analytics-report-row-value"><strong>{fmtRp(row.pending_value)}</strong><small>{row.overdue ? "Terlambat" : `${fmtNumber(row.pending_units)} pcs tersisa`}{row.first_receipt_days == null ? "" : ` · ${fmtNumber(row.first_receipt_days)} hari ke penerimaan pertama`}</small></div>
          </article>)}
        </div> : <Empty />}
      </Panel>
      <p className="analytics-report-note">{data?.note}</p>
    </>
  );
}

export default function ReportAnalyticsWorkspace({ report, user, activeBranchId, period, apiUrl, store, storeName, logo, selectedView, onSelectedViewChange, salesContent, closingContent }) {
  const selected = selectedView || "sales";
  const [payloads, setPayloads] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const key = useMemo(() => `${selected}:${period.start}:${period.end}:${activeBranchId || ""}`, [selected, period.start, period.end, activeBranchId]);
  const insightData = payloads[key];
  const selectedLabel = selected === "products" && user?.role !== "owner"
    ? "Produk"
    : VIEWS.find((entry) => entry.id === selected)?.label || "Laporan";

  useEffect(() => {
    if ((!insightViews.has(selected) && !supportingViews.has(selected)) || !period.start || !period.end || !activeBranchId || payloads[key]) {
      setLoading(false);
      setError("");
      return undefined;
    }
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (selected === "tax") return loadTaxReport({ apiUrl, start: period.start, end: period.end, activeBranchId, user, signal: controller.signal });
      if (selected === "expenses") {
        const qs = new URLSearchParams({ type: "expense", date_from: period.start, date_to: period.end, limit: "100" });
        if (user?.role === "owner") qs.set("branch_id", activeBranchId);
        const body = await fetchReportJson(`${apiUrl}/finance/expenses?${qs}`, controller.signal);
        return { expenses: body.data || [], total: body.total || 0 };
      }
      const qs = new URLSearchParams({ view: selected, start: period.start, end: period.end });
      if (user?.role === "owner") qs.set("branch_id", activeBranchId);
      return (await fetchReportJson(`${apiUrl}/reports/insights?${qs}`, controller.signal)).data;
    };
    load()
      .then((data) => { if (current) setPayloads((old) => ({ ...old, [key]: data })); })
      .catch((reason) => {
        if (current && reason.name !== "AbortError") setError(reason.message || "Laporan tidak dapat dimuat");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [selected, period.start, period.end, activeBranchId, user?.role, apiUrl, key, payloads]);

  const exportRows = () => {
    if (selected === "sales") {
      downloadCsv(selected,
        ["Bagian", "Nama", "Rincian", "Jumlah", "Nilai"],
        [
          ["Ringkasan", "Transaksi", "", report?.summary?.transactions, ""],
          ["Ringkasan", "Penjualan bersih", "", "", report?.summary?.gross_sales],
          ["Ringkasan", "Laba kotor", "", "", report?.summary?.gross_profit],
          ...(report?.daily_sales || []).map((row) => ["Harian", row.date, `${row.transactions} transaksi`, "", row.revenue]),
          ...(report?.transactions || []).map((row) => ["Transaksi", row.invoice_no, `${row.cashier} · ${row.status}`, "", Math.max(0, number(row.grand_total) - number(row.cancelled_amount) - number(row.refunded_amount) - number(row.shipping_cost))]),
        ]);
    } else if (selected === "products") {
      downloadCsv(selected, ["Produk", "SKU", "Kategori", "Terjual", "Omzet", "HPP", "Laba"], (report?.products || []).map((row) => [row.name, row.sku, row.category_name, row.quantity_sold, row.revenue, row.cost_of_goods, row.profit]));
    } else if (selected === "payments") {
      downloadCsv("pembayaran", ["Metode", "Transaksi", "Jumlah"], (report?.payment_methods || []).map((row) => [row.payment_method, row.transactions, row.amount]));
    } else if (selected === "expenses") {
      downloadCsv("pengeluaran", ["Tanggal", "Nama", "Kategori", "Metode", "Status", "Jumlah", "Catatan"], (insightData?.expenses || []).filter((row) => row.status === "approved").map((row) => [row.expense_date, row.name, row.category, row.payment_method, row.status, row.amount, row.notes]));
    } else if (selected === "returns") {
      downloadCsv("pengembalian", ["Tanggal", "No. retur", "Invoice", "Dibuat oleh", "Status", "Barang (pcs)", "Refund"], (report?.returns || []).map((row) => [row.created_at, row.return_no, row.invoice_no, row.created_by_name, row.status, row.quantity_returned, row.refund_amount]));
    } else if (selected === "tax") {
      downloadCsv("ppn-masukan", ["Bagian", "Bulan", "Transaksi", "Omzet / pembelian", "Dasar PPN", "Nilai PPN"], [
        ["PPN keluaran", "", insightData?.ppn_keluaran?.transactions, insightData?.ppn_keluaran?.gross_sales, insightData?.ppn_keluaran?.ppn_base, insightData?.ppn_keluaran?.ppn_amount],
        ["PPN masukan", "", insightData?.ppn_masukan?.orders, insightData?.ppn_masukan?.total_purchase, insightData?.ppn_masukan?.ppn_base, insightData?.ppn_masukan?.ppn_amount],
        ["PPN bersih", "", "", "", "", insightData?.net_ppn],
        ...(insightData?.monthly || []).map((row) => ["Keluaran bulanan", row.month, row.transactions, row.gross_sales, row.ppn_base, row.ppn_keluaran]),
      ]);
    } else if (selected === "inventory") {
      downloadCsv(selected, ["Produk", "SKU", "Stok fisik total", "Stok gudang aktif non-reject", "Dicadangkan", "Tersedia", "Minimum", "Terjual 30 hari", "PO masuk", "Saran restok", "Biaya satuan"], (insightData?.products || []).map((row) => [row.name, row.sku, row.total_stock, row.stock, row.reserved_units, row.available_stock, row.min_stock, row.units_sold_30d, row.incoming_units, row.suggested_reorder, row.unit_cost]));
    } else if (selected === "channels") {
      downloadCsv(selected, ["Kanal", "Barang keluar (pcs)", "Batch", "Produk"], (insightData?.channels || []).map((row) => [row.channel_name, row.units, row.batches, row.products]));
    } else if (selected === "customers") {
      downloadCsv(selected, ["Pelanggan", "Telepon", "Transaksi", "Omzet", "Pembelian pertama", "Pembelian terakhir"], (insightData?.customers || []).map((row) => [row.name, row.phone, row.transactions, row.revenue, row.first_purchase, row.last_purchase]));
    } else if (selected === "suppliers") {
      downloadCsv(selected, ["PO", "Supplier", "Status", "Tanggal", "Target", "Dipesan", "Diterima", "Sisa pcs", "Nilai sisa"], (insightData?.orders || []).map((row) => [row.po_number || row.id, row.supplier_name, row.status, row.order_date, row.expected_date, row.ordered_units, row.received_units, row.pending_units, row.pending_value]));
    }
  };

  return (
    <div className="reports-print-scope">
      <div className="report-brand report-brand-print-only">
        {logo && String(store?.show_logo) !== "false" ? <img src={logo} alt={`Logo ${storeName}`} /> : null}
        <div><strong>{storeName}</strong><span>{store?.store_address || ""}</span></div>
        <h1 className="report-title">Laporan {selectedLabel}</h1>
      </div>
      <nav className="analytics-report-nav" aria-label="Kategori laporan">
        {VIEWS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={selected === id ? "is-active" : ""} aria-current={selected === id ? "page" : undefined} onClick={() => onSelectedViewChange?.(id)}>
          <Icon size={16} aria-hidden="true" /><span>{id === "products" && user?.role !== "owner" ? "Produk" : label}</span>
        </button>)}
      </nav>
      {selected === "sales" ? <>
        <ReportHeading view={selected} onExport={exportRows}>Omzet, jumlah transaksi, produk terjual, diskon, dan tren penjualan pada periode terpilih.</ReportHeading>
        <SalesSummary report={report} />
        {salesContent}
      </> : selected === "closing" ? <>
        <ReportHeading view={selected} hideExport>Ringkasan penjualan, retur, pengeluaran, pemasukan, dan total kas yang diharapkan pada tanggal laporan.</ReportHeading>
        {closingContent}
      </> : selected === "payments" ? <>
        <ReportHeading view={selected} onExport={exportRows}>Total pembayaran dan pembagiannya menurut metode yang digunakan.</ReportHeading>
        <PaymentsView report={report} />
      </> : selected === "expenses" || selected === "tax" ? <>
        <ReportHeading view={selected} onExport={exportRows} disabled={!insightData || loading}>
          {selected === "expenses" ? "Total pengeluaran yang disetujui, per tanggal, dan rinciannya." : "PPN keluaran, PPN masukan dari pembelian, dan selisih PPN pada periode ini."}
        </ReportHeading>
        {loading && !insightData ? <section className="analytics-report-panel" role="status">Memuat laporan…</section> : null}
        {error ? <section className="analytics-report-error" role="alert"><span>{error}</span><button type="button" onClick={() => setPayloads((old) => { const next = { ...old }; delete next[key]; return next; })}>Coba lagi</button></section> : null}
        {insightData ? (selected === "expenses" ? <ExpensesView report={report} data={insightData} /> : <TaxView data={insightData} />) : null}
        {!loading && !error && !insightData ? <section className="analytics-report-panel"><Empty /></section> : null}
      </> : selected === "returns" ? <>
        <ReportHeading view={selected} onExport={exportRows}>Jumlah barang kembali, status pengajuan, dan nilai refund yang disetujui.</ReportHeading>
        <ReturnsView report={report} />
      </> : selected === "products" ? <>
        <ReportHeading view={selected} title={user?.role === "owner" ? undefined : "Produk"} onExport={exportRows}>{user?.role === "owner" ? "Margin memakai harga dan biaya yang tersimpan pada transaksi." : "Laba produk memakai harga dan biaya yang tersimpan pada transaksi."}</ReportHeading>
        <ProductView data={report} isOwner={user?.role === "owner"} />
      </> : <>
        <ReportHeading view={selected} onExport={exportRows} disabled={!insightData}>
          {selected === "inventory" ? "Kondisi stok saat ini, produk bergerak lambat, dan usulan pengadaan." : null}
          {selected === "channels" ? "Jumlah barang keluar dari pencatatan kanal stok manual." : null}
          {selected === "customers" ? "Pelanggan baru, pembelian ulang, dan pelanggan tidak aktif." : null}
          {selected === "suppliers" ? "Purchase order, barang tersisa, keterlambatan, dan waktu penerimaan." : null}
        </ReportHeading>
        {loading && !insightData ? <section className="analytics-report-panel" role="status">Memuat laporan…</section> : null}
        {error ? <section className="analytics-report-error" role="alert"><span>{error}</span><button type="button" onClick={() => setPayloads((old) => { const next = { ...old }; delete next[key]; return next; })}>Coba lagi</button></section> : null}
        {insightData ? <>
          {selected === "inventory" ? <InventoryView data={insightData} /> : null}
          {selected === "channels" ? <ChannelView data={insightData} /> : null}
          {selected === "customers" ? <CustomerView data={insightData} /> : null}
          {selected === "suppliers" ? <SupplierView data={insightData} /> : null}
        </> : null}
        {!loading && !error && !insightData ? <section className="analytics-report-panel"><Empty /></section> : null}
      </>}
    </div>
  );
}
