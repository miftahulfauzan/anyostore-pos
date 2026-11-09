"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import DateRangePresets from "../components/DateRangePresets";
import { getWarehousePeriodRange } from "../dashboard/warehouse-periods.mjs";
import { useAppSession } from "../components/AppStateProvider";
import { createRequestSequence } from "../components/app-state.cjs";
import OlseraDashboardSections from "../dashboard/OlseraDashboardSections";
import ReportDetailAccordions from "./ReportDetailAccordions";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export default function ReportsPage() {
  const { user, activeBranchId } = useAppSession();
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [preset, setPreset] = useState("last7");
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
    if (!period.start) setPeriod(getWarehousePeriodRange('last7'));
  }, []);

  const store = storeContext?.branchId === activeBranchId ? storeContext.data : null;
  const reportStore = String(report?.branch_id ?? '') === String(activeBranchId) ? report : null;
  const storeName = store?.store_name || reportStore?.branch_name || (activeBranchId === 'all' ? 'Semua Toko/Gudang' : activeBranchId ? 'Memuat toko…' : 'Laporan toko');
  const logo = store?.store_logo ? apiUrl.replace("/api", "") + store.store_logo : "";

  return (
    <AppShell
      title="Laporan"
      eyebrow="ANALISIS TOKO"
      actions={
        <>
          <a className="button-link" href="/reports/tax">Laporan Pajak</a>
          <a className="button-link" href="/finance">Keuangan</a>
          <button type="button" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        </>
      }
    >
      <div className="report-brand">
        {logo && String(store?.show_logo) !== "false" && <img src={logo} alt={`Logo ${storeName}`} />}
        <div>
          <strong>{storeName}</strong>
          <span>{store?.store_address || ""}</span>
          <small>Periode {period.start} sampai {period.end}</small>
        </div>
        <h1 className="report-title">Laporan Penjualan</h1>
      </div>
      <section className="report-filter panel">
        <div>
          <h2>Periode laporan</h2>
          <p className="muted">Gunakan periode yang sama untuk semua laporan.</p>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <DateRangePresets
            active={preset}
            onPick={(key, range) => { setPreset(key); if (range) setPeriod(range); }}
          />
        </div>
        <label>
          Mulai
          <input type="date" value={period.start} onChange={(event) => { setPreset('custom'); setPeriod({ ...period, start: event.target.value }); }} />
        </label>
        <label>
          Sampai
          <input type="date" value={period.end} onChange={(event) => { setPreset('custom'); setPeriod({ ...period, end: event.target.value }); }} />
        </label>
        <button type="button" onClick={() => load()} disabled={loading}>{loading ? "Memuat…" : "Tampilkan"}</button>
      </section>
      {message && <p className="message" role="status">{message}</p>}
      {!report ? (
        <section className="panel"><p>Memuat laporan…</p></section>
      ) : (
        <>
          <div className="reports-android-summary">
            <OlseraDashboardSections reportData={report} fallbackData={null} />
          </div>
          <ReportDetailAccordions report={report} user={user} activeBranchId={activeBranchId} />
        </>
      )}
    </AppShell>
  );
}
