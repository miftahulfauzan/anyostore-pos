'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyForm = { name: '', email: '', password: '', role: 'kasir', pin: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // { id, name, email, role, pin }
  const [pwTarget, setPwTarget] = useState(null); // { id, name }
  const [newPassword, setNewPassword] = useState('');

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function load(branchId) {
    const suffix = branchId ? '?branch_id=' + branchId : '';
    const res = await fetch(api + '/users' + suffix, { headers: headers() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message);
    setUsers(body.data);
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    Promise.all([
      fetch(api + '/users/branches', { headers: headers() }).then((r) => r.json()),
      fetch(api + '/users', { headers: headers() }).then((r) => r.json()),
    ])
      .then(([b, u]) => {
        if (!b.success || !u.success) throw new Error(b.message || u.message);
        setBranches(b.data);
        const selected = u.data[0]?.branch_id || b.data[0]?.id || '';
        setBranch(String(selected));
        setUsers(u.data);
      })
      .catch((e) => setMessage(e.message));
  }, []);

  async function changeBranch(id) {
    setBranch(id);
    try { await load(id); } catch (e) { setMessage(e.message); }
  }

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await fetch(api + '/users', { method: 'POST', headers: headers(), body: JSON.stringify({ ...form, branch_id: Number(branch) }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setForm(emptyForm);
      setMessage('Pengguna ditambahkan.');
      load(branch);
    } catch (e) { setMessage(e.message); }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${api}/users/${editing.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ name: editing.name, email: editing.email, role: editing.role, pin: editing.pin || undefined }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setMessage('Pengguna diperbarui.');
      setEditing(null);
      load(branch);
    } catch (e) { setMessage(e.message); }
  }

  async function savePassword(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${api}/users/${pwTarget.id}/password`, { method: 'PUT', headers: headers(), body: JSON.stringify({ new_password: newPassword }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setMessage(`Password ${pwTarget.name} diperbarui.`);
      setPwTarget(null);
      setNewPassword('');
    } catch (e) { setMessage(e.message); }
  }

  async function toggleActive(user) {
    try {
      const res = await fetch(`${api}/users/${user.id}/toggle-active`, { method: 'PUT', headers: headers() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      load(branch);
    } catch (e) { setMessage(e.message); }
  }

  async function removeUser(user) {
    if (!window.confirm(`Hapus pengguna "${user.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const res = await fetch(`${api}/users/${user.id}`, { method: 'DELETE', headers: headers() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setMessage('Pengguna dihapus.');
      load(branch);
    } catch (e) { setMessage(e.message); }
  }

  return (
    <AppShell title="Pegawai & Hak Akses" eyebrow="ADMINISTRASI">
      <section className="panel">
        <label>Toko yang dikelola
          <select value={branch} onChange={(e) => changeBranch(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <p className="muted">Hanya owner yang dapat mengelola pengguna. Owner dapat mengedit dan menghapus semua pengguna kecuali akunnya sendiri.</p>
      </section>

      <section className="product-grid">
        <form className="panel" onSubmit={submit}>
          <h2>Tambah Pengguna</h2>
          <label>Nama<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input required minLength="8" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Peran
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="manager">Manager — operasional & laporan toko</option>
              <option value="admin">Admin — produk, stok & pengaturan toko</option>
              <option value="kasir">Kasir — POS, pelanggan & retur</option>
              <option value="gudang">Gudang — stok, opname & penerimaan</option>
            </select>
          </label>
          <label>PIN (opsional)<input pattern="[0-9]{6}" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></label>
          <button>Simpan</button>
          {message && <p className="message">{message}</p>}
        </form>

        <section className="panel">
          <h2>Tim toko</h2>
          <div className="product-list">
            {users.map((u) => (
              <article key={u.id}>
                <div>
                  <strong>{u.name}</strong>
                  <span>{u.email} · {u.role} · {u.branch_name}</span>
                </div>
                <div className="user-actions">
                  <button type="button" className="link-button" onClick={() => setEditing({ id: u.id, name: u.name, email: u.email, role: u.role, pin: '' })}>Edit</button>
                  <button type="button" className="link-button" onClick={() => { setPwTarget({ id: u.id, name: u.name }); setNewPassword(''); }}>Password</button>
                  <button type="button" className="link-button" onClick={() => toggleActive(u)}>{u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button type="button" className="link-button danger" onClick={() => removeUser(u)}>Hapus</button>
                  <strong className={u.is_active ? 'status-active' : 'status-inactive'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</strong>
                </div>
              </article>
            ))}
            {!users.length && <p>Belum ada pengguna di toko ini.</p>}
          </div>
        </section>
      </section>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <form className="panel modal-card" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Pengguna</h2>
            <label>Nama<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>Email<input required type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></label>
            <label>Peran
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="kasir">Kasir</option>
                <option value="gudang">Gudang</option>
              </select>
            </label>
            <label>PIN baru (kosongkan jika tidak diubah)<input pattern="[0-9]{6}" value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} /></label>
            <div className="modal-actions">
              <button type="submit">Simpan</button>
              <button type="button" className="link-button" onClick={() => setEditing(null)}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {pwTarget && (
        <div className="modal-backdrop" onClick={() => setPwTarget(null)}>
          <form className="panel modal-card" onSubmit={savePassword} onClick={(e) => e.stopPropagation()}>
            <h2>Ganti Password — {pwTarget.name}</h2>
            <label>Password baru<input required minLength="8" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
            <div className="modal-actions">
              <button type="submit">Simpan</button>
              <button type="button" className="link-button" onClick={() => setPwTarget(null)}>Batal</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
