'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', price_tier: 'reguler' });
  const h = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(q = '') {
    const r = await fetch(api + '/customers?search=' + encodeURIComponent(q), { headers: h() });
    const b = await r.json();
    if (!r.ok) throw new Error(b.message);
    setCustomers(b.data);
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) window.location.assign('/');
    else load().catch((e) => setMessage(e.message));
  }, []);

  function startEdit(c) {
    setEditing(c.id);
    setForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', price_tier: c.price_tier || 'reguler' });
  }
  function reset() {
    setEditing(null);
    setForm({ name: '', phone: '', email: '', price_tier: 'reguler' });
  }
  async function submit(e) {
    e.preventDefault();
    try {
      const url = editing ? `${api}/customers/${editing}` : api + '/customers';
      const method = editing ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: h(), body: JSON.stringify(form) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage(editing ? 'Pelanggan diperbarui.' : 'Pelanggan tersimpan.');
      reset();
      load(search);
    } catch (e) { setMessage(e.message); }
  }
  async function remove(id) {
    if (!confirm('Hapus pelanggan ini?')) return;
    try {
      const r = await fetch(`${api}/customers/${id}`, { method: 'DELETE', headers: h() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Pelanggan dihapus.');
      load(search);
    } catch (e) { setMessage(e.message); }
  }

  return (
    <AppShell title="Pelanggan" eyebrow="CRM" actions={<a className="button-link" href="/pos">Kembali ke POS</a>}>
      <section className="product-grid">
        <form className="panel" onSubmit={submit}>
          <h2>{editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</h2>
          <label>Nama<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Telepon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Tipe Harga
            <select value={form.price_tier} onChange={(e) => setForm({ ...form, price_tier: e.target.value })}>
              <option value="reguler">Reguler</option>
              <option value="semi_grosir">Semi Grosir</option>
              <option value="grosir_seri">Grosir Seri</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit">{editing ? 'Simpan Perubahan' : 'Simpan'}</button>
            {editing && <button type="button" className="secondary" onClick={reset}>Batal</button>}
          </div>
          {message && <p className="message">{message}</p>}
        </form>
        <section className="panel">
          <h2>Daftar Pelanggan</h2>
          <input type="text" placeholder="Cari nama / telepon…" value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} />
          <div className="product-list customer-list">
            {customers.map((c) => (
              <article key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.phone || c.email || 'Tanpa kontak'}</span>
                  <span className={`tier-badge ${c.price_tier || 'retail'}`}>
                    {c.price_tier === 'semi_grosir' ? 'Semi Grosir' : c.price_tier === 'grosir_seri' ? 'Grosir Seri' : 'Reguler'}
                  </span>
                </div>
                <div className="actions">
                  <button type="button" onClick={() => startEdit(c)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(c.id)}>Hapus</button>
                </div>
              </article>
            ))}
            {!customers.length && <p>Belum ada pelanggan.</p>}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
