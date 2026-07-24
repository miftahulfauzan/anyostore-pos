'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const blank = (type) => ({
  category_id: '',
  name: '',
  amount: '',
  payment_method: 'cash',
  expense_date: new Date().toISOString().slice(0, 10),
  notes: '',
  type,
});

export default function Expenses() {
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState('expense');
  const [form, setForm] = useState(blank('expense'));
  const [newCategory, setNewCategory] = useState({ name: '', account_code: active === 'income' ? '4-2000' : '5-1000', type: active });
  const h = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load() {
    const [catRes, expRes, incRes] = await Promise.all([
      fetch(api + '/finance/expense-categories', { headers: h() }),
      fetch(api + '/finance/expenses?type=expense', { headers: h() }),
      fetch(api + '/finance/expenses?type=income', { headers: h() }),
    ]);
    const c = await catRes.json(), e = await expRes.json(), i = await incRes.json();
    if (!catRes.ok || !expRes.ok || !incRes.ok) throw new Error(c.message || e.message || i.message);
    setCategories(c.data);
    setExpenses(e.data);
    setIncome(i.data);
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    load().catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    setForm(blank(active));
    setNewCategory({ name: '', account_code: active === 'income' ? '4-2000' : '5-1000', type: active });
  }, [active]);

  function categoryOptions(type) {
    return categories.filter((c) => c.type === type || (type === 'expense' && !c.type) || (type === 'income' && c.type === 'income'));
  }

  async function addCategory(e) {
    e.preventDefault();
    try {
      const r = await fetch(api + '/finance/expense-categories', { method: 'POST', headers: h(), body: JSON.stringify(newCategory) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setNewCategory({ name: '', account_code: active === 'income' ? '4-2000' : '5-1000', type: active });
      setMessage('Kategori disimpan dan tersedia di perangkat lain.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  async function submit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      const r = await fetch(api + '/finance/expenses', {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({ ...form, category_id: Number(form.category_id), amount: Number(form.amount), type: active }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(`${active === 'income' ? 'Pemasukan' : 'Pengeluaran'} harian disimpan dan menunggu persetujuan.`);
      setForm(blank(active));
      load();
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  async function approve(id) {
    try {
      const r = await fetch(`${api}/finance/expenses/${id}/approve`, { method: 'PUT', headers: h() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Disetujui: ' + b.data.journal_no);
      load();
    } catch (e) { setMessage(e.message); }
  }

  return (
    <AppShell title="Pengeluaran & Pemasukan" eyebrow="BISNIS & KEUANGAN" actions={<a className="button-link" href="/finance">Laba Rugi</a>}>
      <div className="tabs">
        <button type="button" className={active === 'expense' ? 'active' : ''} onClick={() => setActive('expense')}>Pengeluaran</button>
        <button type="button" className={active === 'income' ? 'active' : ''} onClick={() => setActive('income')}>Pemasukan</button>
      </div>
      <section className="panel">
        <h2>Form {active === 'income' ? 'Kas Masuk' : 'Pengeluaran'}</h2>
        <form onSubmit={submit}>
          <label>Kategori
            <select required value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Pilih kategori</option>
              {categoryOptions(active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Keterangan<input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
          <label>Jumlah<input required min="0" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></label>
          <label>Metode
            <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}>
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="debit">Debit</option>
            </select>
          </label>
          <label>Tanggal<input required type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} /></label>
          <label>Catatan<textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
          <button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan ' + (active === 'income' ? 'Pemasukan' : 'Pengeluaran')}</button>
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
      <section className="panel">
        <h2>Riwayat {active === 'income' ? 'Pemasukan' : 'Pengeluaran'}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Metode</th><th>Jumlah</th><th>Status</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {(active === 'income' ? income : expenses).map((row) => (
                <tr key={row.id}>
                  <td>{row.expense_date}</td>
                  <td>{row.category}</td>
                  <td>{row.name}</td>
                  <td>{row.payment_method}</td>
                  <td>{rp(row.amount)}</td>
                  <td>{row.status}</td>
                  <td>{row.status === 'pending' ? <button type="button" onClick={() => approve(row.id)}>Setujui</button> : '—'}</td>
                </tr>
              ))}
              {(active === 'income' ? income : expenses).length === 0 && <tr><td colSpan={7}>Belum ada data.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
