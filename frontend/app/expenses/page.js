'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import DateRangePresets from '../components/DateRangePresets';
import { localDateString, localMonthStartString } from '../lib/local-date';
import { labelFor, paymentLabels, statusLabels } from '../lib/ui-labels';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;

function dateLabel(value) {
  const [year, month, day] = String(value || '').split('-');
  return year ? `${day}/${month}/${year}` : '-';
}

export default function ExpensesPage() {
  const { user, activeBranchId } = useAppSession();
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ start: '', end: '', categoryId: '', paymentMethod: '', search: '' });
  const [draftFilters, setDraftFilters] = useState({ start: '', end: '', categoryId: '', paymentMethod: '', search: '' });
  const [period, setPeriod] = useState('thisMonth');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const start = localMonthStartString();
    const end = localDateString();
    setFilters((current) => ({ ...current, start, end }));
    setDraftFilters((current) => ({ ...current, start, end }));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    fetch(`${api}/finance/expense-categories`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Kategori tidak dapat dimuat.');
        return body.data || [];
      })
      .then((items) => { if (active) setCategories(items.filter((item) => item.type === 'expense' || !item.type)); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user || !filters.start || !filters.end) return undefined;
    const requestId = ++requestSequence.current;
    const query = new URLSearchParams({
      type: 'expense',
      date_from: filters.start,
      date_to: filters.end,
      page: String(page),
      limit: '20',
    });
    if (filters.categoryId) query.set('category_id', filters.categoryId);
    if (filters.paymentMethod) query.set('payment_method', filters.paymentMethod);
    if (filters.search.trim()) query.set('search', filters.search.trim());
    if (user.role === 'owner' && activeBranchId) query.set('branch_id', activeBranchId);
    setLoading(true);
    setMessage('');
    fetch(`${api}/finance/expenses?${query.toString()}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Riwayat pengeluaran tidak dapat dimuat.');
        return body;
      })
      .then((body) => {
        if (requestId !== requestSequence.current) return;
        setRows(body.data || []);
        setPagination({ total: Number(body.total || 0), totalPages: Number(body.totalPages || 0), limit: Number(body.limit || 20) });
      })
      .catch((error) => { if (requestId === requestSequence.current) setMessage(error.message); })
      .finally(() => { if (requestId === requestSequence.current) setLoading(false); });
    return () => { requestSequence.current += 1; };
  }, [user, activeBranchId, filters, page]);

  function setDraft(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    if (!draftFilters.start || !draftFilters.end || draftFilters.start > draftFilters.end) {
      setMessage('Rentang tanggal tidak valid.');
      return;
    }
    setPage(1);
    setFilters({ ...draftFilters, search: draftFilters.search.trim() });
    setPeriod('custom');
  }

  function pickPeriod(key, range) {
    setPeriod(key);
    const next = { ...draftFilters, start: range.start, end: range.end };
    setDraftFilters(next);
    setFilters((current) => ({ ...current, start: range.start, end: range.end }));
    setPage(1);
  }

  function resetFilters() {
    const start = localMonthStartString();
    const end = localDateString();
    const next = { start, end, categoryId: '', paymentMethod: '', search: '' };
    setPeriod('thisMonth');
    setDraftFilters(next);
    setFilters(next);
    setPage(1);
  }

  const showBranch = user?.role === 'owner' && activeBranchId === 'all';

  return (
    <AppShell
      title="Riwayat Pengeluaran"
      eyebrow="KEUANGAN"
      actions={<a className="button-link" href="/finance">← Kembali ke Keuangan</a>}
    >
      <section className="panel expense-history-toolbar">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FILTER DATA</p>
            <h2>Telusuri pengeluaran</h2>
            <p className="muted">Pilih periode dan filter lain untuk melihat transaksi yang dibutuhkan.</p>
          </div>
          <strong className="expense-history-total">{pagination.total} data</strong>
        </div>
        <DateRangePresets active={period} onPick={pickPeriod} label="Pilih periode riwayat pengeluaran" />
        <form className="expense-history-filters" onSubmit={applyFilters}>
          <label>Dari<input type="date" value={draftFilters.start} onChange={(event) => setDraft('start', event.target.value)} /></label>
          <label>Sampai<input type="date" value={draftFilters.end} onChange={(event) => setDraft('end', event.target.value)} /></label>
          <label>Kategori<select value={draftFilters.categoryId} onChange={(event) => setDraft('categoryId', event.target.value)}><option value="">Semua kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Metode<select value={draftFilters.paymentMethod} onChange={(event) => setDraft('paymentMethod', event.target.value)}><option value="">Semua metode</option><option value="cash">Tunai</option><option value="transfer">Transfer</option><option value="debit">Debit</option></select></label>
          <label className="expense-history-search">Cari keterangan<input value={draftFilters.search} onChange={(event) => setDraft('search', event.target.value)} placeholder="Contoh: sewa, listrik…" /></label>
          <div className="expense-history-filter-actions"><button type="submit">Terapkan filter</button><button type="button" className="secondary" onClick={resetFilters}>Reset</button></div>
        </form>
      </section>

      {message && <p className="message" role="status">{message}</p>}
      <section className="panel expense-history-results" aria-busy={loading}>
        <div className="section-heading"><div><h2>Daftar pengeluaran</h2><p className="muted">{filters.start ? `${dateLabel(filters.start)} – ${dateLabel(filters.end)}` : 'Memuat periode…'}</p></div>{loading && <span className="muted">Memuat…</span>}</div>
        {rows.length ? <div className="table-wrap"><table>
          <thead><tr><th>Tanggal</th>{showBranch && <th>Toko</th>}<th>Kategori</th><th>Keterangan</th><th>Metode</th><th>Jumlah</th><th>Status</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td>{dateLabel(row.expense_date)}</td>
            {showBranch && <td>{row.branch_name || '-'}</td>}
            <td>{row.category || '-'}</td>
            <td><strong>{row.name || '-'}</strong>{row.notes && <small className="expense-history-note">{row.notes}</small>}</td>
            <td>{labelFor(paymentLabels, row.payment_method)}</td>
            <td><strong>{rupiah(row.amount)}</strong></td>
            <td><span className={`status ${row.status || ''}`}>{labelFor(statusLabels, row.status)}</span></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state"><strong>{loading ? 'Memuat data…' : 'Belum ada pengeluaran'}</strong><span>{loading ? 'Mohon tunggu sebentar.' : 'Coba ubah periode atau filter pencarian.'}</span></div>}
        {pagination.totalPages > 1 && <div className="expense-history-pagination"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button><span>Halaman {page} dari {pagination.totalPages}</span><button type="button" className="secondary" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div>}
      </section>
    </AppShell>
  );
}
