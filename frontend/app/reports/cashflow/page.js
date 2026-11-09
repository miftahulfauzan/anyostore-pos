'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BriefcaseBusiness, CreditCard, Printer, RefreshCcw } from 'lucide-react';
import AppShell from '../../components/AppShell';
import DateRangePresets from '../../components/DateRangePresets';
import { useAppSession } from '../../components/AppStateProvider';
import { getWarehousePeriodRange } from '../../dashboard/warehouse-periods.mjs';
import { openPrintView } from '../../lib/print-utils';
import { labelFor, paymentLabels, statusLabels } from '../../lib/ui-labels';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const dateLabel = (value) => String(value || '').split('-').reverse().join('/') || '-';
const dateTimeLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '-') : date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
};
const normalizeType = (value) => ['payments', 'expenses', 'returns'].includes(value) ? value : 'payments';
const typeConfig = {
  payments: { title: 'Pembayaran', description: 'Rincian transaksi dan metode pembayaran yang membentuk total penjualan.', icon: CreditCard, tone: 'teal' },
  expenses: { title: 'Pengeluaran', description: 'Rincian kas keluar yang tercatat pada periode dan toko yang dipilih.', icon: BriefcaseBusiness, tone: 'orange' },
  returns: { title: 'Pengembalian', description: 'Rincian retur dan refund yang mengurangi penerimaan penjualan.', icon: RefreshCcw, tone: 'purple' },
};

function DetailRow({ label, value, secondary }) {
  return <div className="source-detail-row">
    <div><strong>{label}</strong>{secondary && <small>{secondary}</small>}</div>
    <strong>{value}</strong>
  </div>;
}

function EmptyState({ message }) {
  return <p className="source-detail-empty">{message}</p>;
}

export default function CashflowDetailsPage() {
  const { user, activeBranchId } = useAppSession();
  const [type, setType] = useState('payments');
  const [requestedBranchId, setRequestedBranchId] = useState('');
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [draftPeriod, setDraftPeriod] = useState({ start: '', end: '' });
  const [preset, setPreset] = useState('last7');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fallback = getWarehousePeriodRange('last7');
    const params = new URLSearchParams(window.location.search);
    const nextType = normalizeType(params.get('type'));
    const nextPeriod = {
      start: params.get('start') || fallback.start,
      end: params.get('end') || fallback.end,
    };
    setType(nextType);
    setRequestedBranchId(params.get('branch_id') || '');
    setPeriod(nextPeriod);
    setDraftPeriod(nextPeriod);
  }, []);

  useEffect(() => {
    if (!user || !period.start || !period.end) return undefined;
    let active = true;
    const query = new URLSearchParams({ start: period.start, end: period.end });
    const requestedBranch = requestedBranchId || activeBranchId;
    if (user.role === 'owner' && requestedBranch) query.set('branch_id', requestedBranch);
    setLoading(true);
    setMessage('');

    const load = async () => {
      const overviewResponse = await fetch(`${api}/reports/overview?${query.toString()}`);
      const overviewBody = await overviewResponse.json();
      if (!overviewResponse.ok) throw new Error(overviewBody.message || 'Rincian laporan tidak dapat dimuat.');
      let expenses = [];
      if (type === 'expenses') {
        const expenseQuery = new URLSearchParams({ type: 'expense', date_from: period.start, date_to: period.end, limit: '100' });
        if (user.role === 'owner' && requestedBranch) expenseQuery.set('branch_id', requestedBranch);
        const expenseResponse = await fetch(`${api}/finance/expenses?${expenseQuery.toString()}`);
        const expenseBody = await expenseResponse.json();
        if (!expenseResponse.ok) throw new Error(expenseBody.message || 'Rincian pengeluaran tidak dapat dimuat.');
        expenses = expenseBody.data || [];
      }
      if (active) setData({ overview: overviewBody.data || {}, expenses });
    };

    load().catch((error) => { if (active) setMessage(error.message || 'Rincian laporan tidak dapat dimuat.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, activeBranchId, requestedBranchId, type, period.start, period.end]);

  const config = typeConfig[type];
  const Icon = config.icon;
  const overview = data?.overview || {};
  const methods = overview.payment_methods || [];
  const transactions = (overview.transactions || []).filter((row) => Number(row.grand_total || 0) - Number(row.cancelled_amount || 0) - Number(row.refunded_amount || 0) > 0);
  const returns = overview.returns || [];
  const expenses = data?.expenses || [];
  const periodQuery = useMemo(() => new URLSearchParams({ start: period.start, end: period.end, type }).toString(), [period.start, period.end, type]);

  function applyPreset(key, range) {
    setPreset(key);
    if (range) setDraftPeriod(range);
  }

  function applyPeriod(event) {
    event.preventDefault();
    if (!draftPeriod.start || !draftPeriod.end || draftPeriod.start > draftPeriod.end) return;
    setPeriod(draftPeriod);
  }

  return <AppShell title={config.title} eyebrow="SUMBER DATA LAPORAN" actions={<>
    <Link className="button-link" href={`/reports?${periodQuery}`}>Kembali ke Laporan</Link>
    <button type="button" onClick={() => openPrintView({ selector: '.source-detail-printable', title: `Rincian ${config.title}` })}><Printer aria-hidden="true" size={15} /> Cetak / PDF</button>
  </>}>
    <div className="source-detail-printable">
      <section className={`source-detail-heading panel source-detail-tone-${config.tone}`}>
        <div>
          <Link className="source-detail-back" href={`/reports?${periodQuery}`}><ArrowLeft aria-hidden="true" size={16} /> Laporan</Link>
          <h1><Icon aria-hidden="true" size={23} /> {config.title}</h1>
          <p>{config.description}</p>
          <small>Periode {dateLabel(period.start)} – {dateLabel(period.end)}</small>
        </div>
        <span className="source-detail-heading-badge">Lihat sumber data</span>
      </section>

      <section className="source-detail-filter panel">
        <div>
          <h2>Filter periode</h2>
          <p className="muted">Gunakan filter yang sama dengan dashboard penjualan.</p>
        </div>
        <DateRangePresets active={preset} onPick={applyPreset} />
        <form className="source-detail-date-form" onSubmit={applyPeriod}>
          <label>Mulai<input type="date" value={draftPeriod.start} onChange={(event) => setDraftPeriod((current) => ({ ...current, start: event.target.value }))} /></label>
          <span aria-hidden="true">s/d</span>
          <label>Sampai<input type="date" value={draftPeriod.end} onChange={(event) => setDraftPeriod((current) => ({ ...current, end: event.target.value }))} /></label>
          <button type="submit">Tampilkan</button>
        </form>
      </section>

      {message && <p className="message" role="status">{message}</p>}
      {loading && <section className="panel"><p>Memuat sumber data…</p></section>}
      {!loading && !message && <section className="source-detail-content">
        {type === 'payments' && <>
          <section className="panel source-detail-card">
            <div className="section-heading"><div><h2>Metode pembayaran</h2><p>Total per metode yang tercatat.</p></div><span className="source-detail-count">{methods.length} metode</span></div>
            {methods.length ? methods.map((row) => <DetailRow key={row.payment_method} label={labelFor(paymentLabels, row.payment_method)} value={rp(row.amount)} secondary={`${row.transactions || 0} transaksi`} />) : <EmptyState message="Belum ada pembayaran pada periode ini." />}
          </section>
          <section className="panel source-detail-card">
            <div className="section-heading"><div><h2>Transaksi sumber pembayaran</h2><p>Invoice, kasir, metode, dan nilai bersih transaksi.</p></div><span className="source-detail-count">{transactions.length} transaksi</span></div>
            {transactions.length ? transactions.map((row) => <DetailRow key={row.id} label={row.invoice_no || '-'} value={rp(Number(row.grand_total) - Number(row.cancelled_amount || 0) - Number(row.refunded_amount || 0))} secondary={`${row.cashier || '-'} · ${dateTimeLabel(row.created_at)} · ${labelFor(paymentLabels, row.payment_method)}`} />) : <EmptyState message="Belum ada transaksi pembayaran pada periode ini." />}
          </section>
        </>}

        {type === 'expenses' && <section className="panel source-detail-card">
          <div className="section-heading"><div><h2>Daftar kas keluar</h2><p>Kategori, metode, tanggal, dan catatan sumber pengeluaran.</p></div><span className="source-detail-count">{expenses.length} data</span></div>
          {expenses.length ? expenses.map((row) => <DetailRow key={row.id} label={row.name || row.category || 'Pengeluaran'} value={rp(row.amount)} secondary={`${row.category || 'Tanpa kategori'} · ${dateLabel(row.expense_date)} · ${labelFor(paymentLabels, row.payment_method)}${row.notes ? ` · ${row.notes}` : ''}`} />) : <EmptyState message="Belum ada pengeluaran pada periode ini." />}
        </section>}

        {type === 'returns' && <section className="panel source-detail-card">
          <div className="section-heading"><div><h2>Daftar pengembalian</h2><p>Nomor retur, invoice asal, status, qty, dan nilai refund.</p></div><span className="source-detail-count">{returns.length} retur</span></div>
          {returns.length ? returns.map((row) => <DetailRow key={row.id} label={row.return_no || 'Retur'} value={rp(row.refund_amount)} secondary={`${row.invoice_no || '-'} · ${row.quantity_returned || 0} pcs · ${labelFor(statusLabels, row.status)} · ${dateTimeLabel(row.created_at)}${row.reason ? ` · ${row.reason}` : ''}`} />) : <EmptyState message="Belum ada pengembalian pada periode ini." />}
        </section>}
      </section>}
    </div>
  </AppShell>;
}
