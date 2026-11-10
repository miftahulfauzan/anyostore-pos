"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import AppShell from "../components/AppShell";
import DateRangePresets from "../components/DateRangePresets";
import { getWarehousePeriodRange, WAREHOUSE_PERIOD_OPTIONS } from "../dashboard/warehouse-periods.mjs";
import { useAppSession } from "../components/AppStateProvider";
import { createRequestSequence } from "../components/app-state.cjs";
import OlseraDashboardSections from "../dashboard/OlseraDashboardSections";
import ReportDetailAccordions from "./ReportDetailAccordions";
import ReportClosingPanel from "./ReportClosingPanel";
import { openPrintView } from "../lib/print-utils";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const PERIOD_FILTER_STORAGE_KEY = "pos_period_filter_open";
const formatBusinessDate = (value) => String(value || '').split('-').reverse().join('/');

export default function ReportsPage() {
  const { user, activeBranchId } = useAppSession();
  const router = useRouter();
  // Laporan penjualan hanya untuk owner/manager/admin. Akun gudang/kasir yang
  // membuka /reports (mis. dari tautan lama) dialihkan supaya tidak memanggil
  // /reports/overview dan memunculkan "Akses ditolak".
  const reportRoleAllowed = !user || ["owner", "manager", "admin"].includes(user.role);
  useEffect(() => {
    if (!user || reportRoleAllowed) return;
    router.replace(user.role === "gudang" ? "/dashboard" : "/pos");
  }, [user, reportRoleAllowed, router]);
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [draftPeriod, setDraftPeriod] = useState({ start: '', end: '' });
  const [preset, setPreset] = useState("today");
  const [filterOpen, setFilterOpen] = useState(true);
  const [report, setReport] = useState(null);
  const [storeContext, setStoreContext] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const reportLoadSequence = useRef(createRequestSequence());

  async function load(nextPeriod = period) {
    if (!reportRoleAllowed) return;
    const requestId = reportLoadSequence.current.next();
    setLoading(true);
    setMessage("");
    setReport(null);
    try {
      const qs = new URLSearchParams({ start: nextPeriod.start, end: nextPeriod.end });
      if (user?.role === 'owner' && activeBranchId) qs.set('branch_id', activeBranchId);
      const response = await fetch(`${apiUrl}/reports/overview?${qs}`, { headers: {} });
      const body = await response.json();
      if (!reportLoadSequence.current.isCurrent(requestId)) return;
      if (!response.ok) throw new Error(body.message || "Laporan tidak dapat dimuat");
      setReport(body.data);
    } catch (error) {
      if (reportLoadSequence.current.isCurrent(requestId)) setMessage(error.message);
    } finally {
      if (reportLoadSequence.current.isCurrent(requestId)) setLoading(false);
    }
  }

  useEffect(() => {
    if (!reportRoleAllowed) return undefined;
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

  useEffect(() => {
    if (!period.start) setPeriod(getWarehousePeriodRange('today'));
  }, []);

  // Simpan pilihan buka/tutup filter periode; default terbuka.
  useEffect(() => {
    if (window.localStorage.getItem(PERIOD_FILTER_STORAGE_KEY) === '0') setFilterOpen(false);
  }, []);

  function toggleFilter() {
    setFilterOpen((open) => {
      window.localStorage.setItem(PERIOD_FILTER_STORAGE_KEY, open ? '0' : '1');
      return !open;
    });
  }

  // Tanggal diketik → terapkan otomatis setelah jeda singkat (tanpa tombol).
  useEffect(() => { setDraftPeriod(period); }, [period.start, period.end]);
  useEffect(() => {
    if (!draftPeriod.start || !draftPeriod.end || draftPeriod.start > draftPeriod.end) return undefined;
    if (draftPeriod.start === period.start && draftPeriod.end === period.end) return undefined;
    const timer = setTimeout(() => {
      setPreset('custom');
      setPeriod(draftPeriod);
    }, 350);
    return () => clearTimeout(timer);
  }, [draftPeriod, period.start, period.end]);

  const activePresetLabel = preset === 'custom'
    ? 'Rentang kustom'
    : (WAREHOUSE_PERIOD_OPTIONS.find((option) => option.key === preset)?.label || 'Hari ini');

  const store = storeContext?.branchId === activeBranchId ? storeContext.data : null;
  const reportStore = String(report?.branch_id ?? '') === String(activeBranchId) ? report : null;
  const storeName = store?.store_name || reportStore?.branch_name || (activeBranchId === 'all' ? 'Semua Toko/Gudang' : activeBranchId ? 'Memuat toko…' : 'Laporan toko');
  const logo = store?.store_logo ? apiUrl.replace("/api", "") + store.store_logo : "";

  if (!reportRoleAllowed) {
    return (
      <AppShell title="Laporan" eyebrow="ANALISIS TOKO">
        <section className="panel"><p>Halaman laporan hanya tersedia untuk owner, manajer, dan admin. Mengalihkan…</p></section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Laporan"
      eyebrow="ANALISIS TOKO"
      actions={
        <>
          <a className="button-link" href="/reports/tax">Laporan Pajak</a>
          <a className="button-link" href="/finance">Keuangan</a>
          <button type="button" onClick={() => openPrintView({ selector: ".app-content", title: "Laporan Penjualan" })}>Cetak / Simpan PDF</button>
        </>
      }
    >
      <div className="report-brand report-brand-print-only">
        {logo && String(store?.show_logo) !== "false" && <img src={logo} alt={`Logo ${storeName}`} />}
        <div>
          <strong>{storeName}</strong>
          <span>{store?.store_address || ""}</span>
        </div>
        <h1 className="report-title">Laporan Penjualan</h1>
      </div>
      <section className={`report-filter panel period-filter${filterOpen ? "" : " period-filter-collapsed"}`}>
        <button type="button" className="period-filter-toggle" onClick={toggleFilter} aria-expanded={filterOpen}>
          <span className="period-filter-label">Periode</span>
          <strong className="period-filter-value">{activePresetLabel}</strong>
          <span className="period-filter-range">
            {formatBusinessDate(period.start) || "-"} – {formatBusinessDate(period.end) || "-"}
          </span>
          {loading ? <span className="period-filter-loading" role="status">Memuat…</span> : null}
          <ChevronDown aria-hidden="true" size={17} className={filterOpen ? "chevron-open" : ""} />
        </button>
        {filterOpen ? (
          <div className="period-filter-body">
            <DateRangePresets
              active={preset}
              onPick={(key, range) => { setPreset(key); if (range) setPeriod(range); }}
              label="Pilih periode laporan"
            />
            <div className="report-period-date-fields">
              <label>
                Mulai
                <input type="date" value={draftPeriod.start} onChange={(event) => setDraftPeriod((current) => ({ ...current, start: event.target.value }))} />
              </label>
              <span aria-hidden="true">s/d</span>
              <label>
                Sampai
                <input type="date" value={draftPeriod.end} onChange={(event) => setDraftPeriod((current) => ({ ...current, end: event.target.value }))} />
              </label>
            </div>
          </div>
        ) : null}
      </section>
      {message && <p className="message" role="status">{message}</p>}
      {!report ? (
        <section className="panel"><p>Memuat laporan…</p></section>
      ) : (
        <>
          <div className="reports-android-summary">
            <OlseraDashboardSections reportData={report} fallbackData={null} activeBranchId={activeBranchId} period={period} />
          </div>
          <ReportDetailAccordions report={report} user={user} activeBranchId={activeBranchId} />
          <ReportClosingPanel date={period.end} branchId={activeBranchId} role={user?.role} />
        </>
      )}
    </AppShell>
  );
}
