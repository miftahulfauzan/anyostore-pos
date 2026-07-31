'use client';

import { useEffect, useState } from 'react';

export default function CategoryManager({ api, token, headers }) {
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [newCat, setNewCat] = useState({ name: '', slug: '', sku_prefix: '' });
  const [editForm, setEditForm] = useState({ name: '', slug: '', sku_prefix: '' });

  async function load() {
    try {
      const r = await fetch(`${api}/products/categories?all=true`, { headers: headers() });
      const b = await r.json();
      setCategories(b.data || []);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function addCategory(e) {
    e.preventDefault();
    if (!newCat.name.trim()) return setMessage('Nama wajib diisi');
    try {
      const r = await fetch(`${api}/products/categories`, { method: 'POST', headers: headers(), body: JSON.stringify(newCat) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setNewCat({ name: '', slug: '', sku_prefix: '' });
      setMessage('Kategori berhasil ditambahkan.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  async function updateCategory(id) {
    try {
      const r = await fetch(`${api}/products/categories/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(editForm) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setEditing(null);
      setMessage('Kategori berhasil diperbarui.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  async function deleteCategory(id, name) {
    if (!confirm(`Hapus kategori "${name}"?`)) return;
    try {
      const r = await fetch(`${api}/products/categories/${id}`, { method: 'DELETE', headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setMessage('Kategori berhasil dihapus.');
      load();
    } catch (e) { setMessage(e.message); }
  }

  return (
    <section className="panel">
      <h2>Kategori Produk</h2>
      <p className="muted" style={{ fontSize: '.85rem' }}>Kelola daftar kategori produk.</p>

      <form onSubmit={addCategory} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
        <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nama kategori" required style={{ flex: 1, minWidth: 160 }} />
        <input value={newCat.slug} onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })} placeholder="Slug (opsional)" style={{ flex: 1, minWidth: 140 }} />
        <input value={newCat.sku_prefix} onChange={(e) => setNewCat({ ...newCat, sku_prefix: e.target.value })} placeholder="Prefix SKU" style={{ flex: 1, minWidth: 120 }} />
        <button type="submit">Tambah</button>
      </form>

      {message && <p className="message" role="status" style={{ marginTop: '.5rem' }}>{message}</p>}

      <div className="table-wrap" style={{ marginTop: '.75rem' }}>
        <table>
          <thead><tr><th>ID</th><th>Nama</th><th>Slug</th><th>Prefix</th><th>Aksi</th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>
                  {editing === c.id ? (
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', maxWidth: 200 }} />
                  ) : (
                    <strong>{c.name}</strong>
                  )}
                </td>
                <td>
                  {editing === c.id ? (
                    <input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })} style={{ width: '100%', maxWidth: 160 }} />
                  ) : (
                    <span>{c.slug || '-'}</span>
                  )}
                </td>
                <td>
                  {editing === c.id ? (
                    <input value={editForm.sku_prefix} onChange={(e) => setEditForm({ ...editForm, sku_prefix: e.target.value })} style={{ width: '100%', maxWidth: 120 }} />
                  ) : (
                    <span>{c.sku_prefix || '-'}</span>
                  )}
                </td>
                <td style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {editing === c.id ? (
                    <>
                      <button type="button" className="small" onClick={() => updateCategory(c.id)}>Simpan</button>
                      <button type="button" className="small secondary" onClick={() => setEditing(null)}>Batal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="small secondary" onClick={() => { setEditing(c.id); setEditForm({ name: c.name, slug: c.slug || '', sku_prefix: c.sku_prefix || '' }); }}>Edit</button>
                      <button type="button" className="small secondary" style={{ color: '#dc2626' }} onClick={() => deleteCategory(c.id, c.name)}>Hapus</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!categories.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Belum ada kategori</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
