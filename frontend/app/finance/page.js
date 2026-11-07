'use client';
import { localDateString } from '../lib/local-date';
import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const blank = (type) => ({ category_id: '', name: '', amount: '', payment_method: 'cash', expense_date: '', notes: '', type });

export default function Finance() {
  const { user, activeBranchId } = useAppSession();
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState('expense');
  const [form, setForm] = useState(blank('expense'));
  const [newCategory, setNewCategory] = useState({ name: '', account_code: '5-1000', type: 'expense' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const loadSequence = useRef(0);
  const headers = () => ({ 'Content-Type': 'application/json'});

  async function load() {
    const requestId = ++loadSequence.current;
    const catRes = await fetch(api + '/finance/expense-categories', { headers: headers() });
    const c = await catRes.json();
    if (!catRes.ok) throw new Error(c.message || 'Kategori tidak dapat dimuat.');
    if (requestId !== loadSequence.current) return;
    setCategories(c.data);
  }
  useEffect(() => {
    if (!user) return;
    let current = true;
    setMessage('');
    load().catch((error) => { if (current) setMessage(error.message); });
    return () => { current = false; };
  }, [activeBranchId, user?.role]);
  useEffect(() => {
    setForm({ ...blank(active), expense_date: localDateString() });
    setNewCategory({ name: '', account_code: active === 'income' ? '4-2000' : '5-1000', type: active });
  }, [active]);

  function categoryOptions(type) {
    return categories.filter((c) => c.type === type || (type === 'expense' && !c.type) || (type === 'income' && c.type === 'income'));
  }
  async function addCategory(e) {
    e.preventDefault();
    try {
      const r = await fetch(api + '/finance/expense-categories', { method: 'POST', headers: headers(), body: JSON.stringify(newCategory) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setNewCategory({ name: '', account_code: active === 'income' ? '4-2000' : '5-1000', type: active });
      setMessage('Kategori disimpan.');
      load();
    } catch (e) { setMessage(e.message); }
  }
  async function submit(e) {
    e.preventDefault();
    try {
      if (user?.role === 'owner' && activeBranchId === 'all') throw new Error('Pilih satu toko di menu atas sebelum menyimpan.');
      setSaving(true);
      const r = await fetch(api + '/finance/expenses', { method: 'POST', headers: headers(), body: JSON.stringify({ ...form, category_id: Number(form.category_id), amount: Number(form.amount), type: active, ...(user?.role === 'owner' ? { branch_id: activeBranchId } : {}) }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(`${active === 'income' ? 'Pemasukan' : 'Pengeluaran'} berhasil disimpan.`);
      setForm(blank(active));
      await load();
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }
  return (
    <AppShell title="Keuangan" eyebrow="BISNIS & KEUANGAN" actions={<a className="button-link" href="/expenses">Riwayat Pengeluaran</a>}>
      <div className="tabs">
        <button type="button" className={active === 'expense' ? 'active' : ''} onClick={() => setActive('expense')}>Pengeluaran</button>
        <button type="button" className={active === 'income' ? 'active' : ''} onClick={() => setActive('income')}>Pemasukan</button>
      </div>

      <section className="panel">
        <h2>Form {active === 'income' ? 'Kas Masuk' : 'Pengeluaran'}</h2>
        {user?.role === 'owner' && activeBranchId === 'all' && <p className="finance-branch-hint">Riwayat menggabungkan semua toko. Pilih satu toko di menu atas untuk mencatat pemasukan atau pengeluaran.</p>}
        <form className="finance-entry-form" onSubmit={submit}>
          <label>Kategori
            <select required value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Pilih kategori</option>
              {categoryOptions(active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Keterangan (opsional)<input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label>Jumlah<input required min="0" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></label>
          <label>Metode
            <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}>
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="debit">Debit</option>
            </select>
          </label>
          <label>Tanggal<input required type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} /></label>
          <label className="finance-notes">Catatan<textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          <button type="submit" disabled={saving || (user?.role === 'owner' && activeBranchId === 'all')}>{saving ? 'Menyimpan…' : 'Simpan ' + (active === 'income' ? 'Pemasukan' : 'Pengeluaran')}</button>
        </form>
        {message && <p className="message" role="status">{message}</p>}
      </section>
      <section className="panel">
        <h2>Kategori {active === 'income' ? 'Pemasukan' : 'Pengeluaran'} Baru</h2>
        <form onSubmit={addCategory}>
          <label>Nama<input required value={newCategory.name} onChange={(e) => setNewCategory((n) => ({ ...n, name: e.target.value }))} /></label>
          <label>Kode Akun<input required value={newCategory.account_code} onChange={(e) => setNewCategory((n) => ({ ...n, account_code: e.target.value }))} /></label>
          <button type="submit">Tambah Kategori</button>
        </form>
      </section>
      <section className="panel finance-history-callout">
        <div className="finance-history-callout-content">
          <div>
            <p className="eyebrow">HISTORI KEUANGAN</p>
            <h2>Riwayat pengeluaran</h2>
            <p className="muted">Gunakan filter periode, kategori, metode pembayaran, dan pencarian agar data lebih mudah ditelusuri.</p>
          </div>
          <a className="button-link" href="/expenses">Buka riwayat</a>
        </div>
      </section>
    </AppShell>
  );
}
